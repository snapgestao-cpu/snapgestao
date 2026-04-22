import React, { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Modal, Alert, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { GoalCard } from '../../components/GoalCard'
import { NewGoalModal } from '../../components/NewGoalModal'
import { BadgeToast } from '../../components/BadgeToast'
import { Badge } from '../../lib/badges'
import { GoalDepositModal } from '../../components/GoalDepositModal'
import { Toast } from '../../components/Toast'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import { Goal } from '../../types'
import { brl } from '../../lib/finance'

const POT_IMAGES = {
  empty: require('../../assets/potes/Pote_vazio.png'),
  p10: require('../../assets/potes/Pote_10.png'),
  p30: require('../../assets/potes/Pote_30.png'),
  p50: require('../../assets/potes/Pote_50.png'),
  p70: require('../../assets/potes/Pote_70.png'),
  p90: require('../../assets/potes/Pote_90.png'),
  p100: require('../../assets/potes/Pote_100.png'),
}

function getPotImage(percent: number) {
  if (percent <= 0) return POT_IMAGES.empty
  if (percent < 20) return POT_IMAGES.p10
  if (percent < 40) return POT_IMAGES.p30
  if (percent < 60) return POT_IMAGES.p50
  if (percent < 80) return POT_IMAGES.p70
  if (percent < 100) return POT_IMAGES.p90
  return POT_IMAGES.p100
}

type TimelineItem = { year: number; label: string }

export default function GoalsScreen() {
  const { user } = useAuthStore()
  const insets = useSafeAreaInsets()

  const [goals, setGoals] = useState<Goal[]>([])
  const [urgentGoal, setUrgentGoal] = useState<Goal | null>(null)
  const [timelineYears, setTimelineYears] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [showNewGoal, setShowNewGoal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null)
  const [actionGoal, setActionGoal] = useState<Goal | null>(null)

  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])

  const loadGoals = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('horizon_years', { ascending: true })
      const loaded = (data as Goal[]) ?? []
      setGoals(loaded)

      // Meta mais urgente: target_date >= hoje, ordenada por target_date
      const today = new Date().toISOString().split('T')[0]
      const urgent = loaded
        .filter(g => g.target_date != null && g.target_date >= today)
        .sort((a, b) => (a.target_date ?? '').localeCompare(b.target_date ?? ''))[0] ?? null
      setUrgentGoal(urgent)

      // Timeline: ano atual + anos únicos das metas com target_date
      const currentYear = new Date().getFullYear()
      const items: TimelineItem[] = [{ year: currentYear, label: 'Hoje' }]
      const seen = new Set([currentYear])
      loaded
        .filter(g => g.target_date != null)
        .sort((a, b) => (a.target_date ?? '').localeCompare(b.target_date ?? ''))
        .forEach(g => {
          const y = new Date(g.target_date! + 'T12:00:00').getFullYear()
          if (!seen.has(y)) { seen.add(y); items.push({ year: y, label: String(y) }) }
        })
      setTimelineYears(items)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    setLoading(true)
    loadGoals()
  }, [loadGoals])

  const onRefresh = () => { setRefreshing(true); loadGoals() }

  const handleSuccess = (msg: string) => {
    loadGoals()
    setToast({ message: msg, color: Colors.primary })
  }

  const handleDeleteGoal = () => {
    if (!actionGoal) return
    const goal = actionGoal
    Alert.alert(
      'Excluir meta',
      `Deseja excluir "${goal.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            setActionGoal(null)
            await supabase.from('goals').delete().eq('id', goal.id)
            loadGoals()
            setToast({ message: 'Meta excluída.', color: Colors.textMuted })
          },
        },
      ]
    )
  }

  const urgentPercent = urgentGoal && urgentGoal.target_amount > 0
    ? Math.min(100, Math.round((urgentGoal.current_amount / urgentGoal.target_amount) * 100))
    : 0

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Metas de longo prazo</Text>

        {/* Cards da meta mais urgente */}
        {goals.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            {/* Card 1 — Meta planejada */}
            <View style={[styles.statCard, { borderLeftColor: Colors.primary }]}>
              <Text style={styles.statLabel}>🎯 Meta planejada</Text>
              <Text style={[styles.statValue, { color: Colors.primary }]} numberOfLines={1}>
                {brl(urgentGoal?.target_amount ?? 0)}
              </Text>
              <Text style={styles.statHint} numberOfLines={1}>
                {urgentGoal?.name ?? '—'}
              </Text>
            </View>

            {/* Card 2 — Já alocado */}
            <View style={[styles.statCard, { borderLeftColor: Colors.accent }]}>
              <Text style={styles.statLabel}>💰 Já alocado</Text>
              <Text style={[styles.statValue, { color: Colors.accent }]} numberOfLines={1}>
                {brl(urgentGoal?.current_amount ?? 0)}
              </Text>
              <Text style={styles.statHint}>
                de {brl(urgentGoal?.target_amount ?? 0)}
              </Text>
            </View>

            {/* Card 3 — Progresso com pote */}
            <View style={[styles.statCard, { alignItems: 'center', borderLeftWidth: 0 }]}>
              <Text style={[styles.statLabel, { alignSelf: 'flex-start' }]}>📊 Progresso</Text>
              <Image
                source={getPotImage(urgentPercent)}
                style={{ width: 44, height: 52, resizeMode: 'contain' }}
              />
              <Text style={[styles.statValue, {
                color: urgentPercent >= 80 ? Colors.danger
                  : urgentPercent >= 50 ? Colors.warning
                  : Colors.accent,
              }]}>
                {urgentPercent}%
              </Text>
            </View>
          </View>
        )}

        {/* Timeline dinâmica */}
        {timelineYears.length > 1 && (
          <View style={styles.timelineWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12 }}>
                {timelineYears.map((item, index) => (
                  <View key={item.year} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {index > 0 && (
                      <View style={{ width: 50, height: 2, backgroundColor: Colors.border }} />
                    )}
                    <View style={{ alignItems: 'center' }}>
                      <View style={{
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: index === 0 ? Colors.primary : Colors.accent,
                        marginBottom: 4,
                      }} />
                      <Text style={[styles.timelineLabel, { color: index === 0 ? Colors.primary : Colors.textDark }]}>
                        {item.label}
                      </Text>
                      {index > 0 && (
                        <Text style={styles.timelineYear}>{item.year}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Goals list */}
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        ) : goals.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyTitle}>Nenhuma meta ainda</Text>
            <Text style={styles.emptyText}>Toque em "Nova meta" para começar.</Text>
          </View>
        ) : (
          goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onDeposit={() => setDepositGoal(goal)}
              onLongPress={() => setActionGoal(goal)}
            />
          ))
        )}
      </ScrollView>

      {/* Botão fixo na base */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          onPress={() => setShowNewGoal(true)}
          style={styles.newGoalBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.newGoalBtnPlus}>+</Text>
          <Text style={styles.newGoalBtnText}>Nova meta</Text>
        </TouchableOpacity>
      </View>

      {/* Goal action sheet */}
      <Modal visible={!!actionGoal} transparent animationType="fade" onRequestClose={() => setActionGoal(null)}>
        <TouchableOpacity
          style={styles.actionBackdrop}
          activeOpacity={1}
          onPress={() => setActionGoal(null)}
        >
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>{actionGoal?.name}</Text>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => { setEditingGoal(actionGoal); setActionGoal(null) }}
            >
              <Text style={styles.actionBtnText}>✏️  Editar meta</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => { setDepositGoal(actionGoal); setActionGoal(null) }}
            >
              <Text style={styles.actionBtnText}>💰  Depositar valor</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleDeleteGoal}>
              <Text style={[styles.actionBtnText, { color: Colors.danger }]}>🗑  Excluir meta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnCancel} onPress={() => setActionGoal(null)}>
              <Text style={styles.actionCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <NewGoalModal
        visible={showNewGoal}
        onClose={() => setShowNewGoal(false)}
        onSuccess={handleSuccess}
        onBadges={setPendingBadges}
      />

      <NewGoalModal
        visible={!!editingGoal}
        onClose={() => setEditingGoal(null)}
        onSuccess={handleSuccess}
        editGoal={editingGoal ?? undefined}
      />

      <GoalDepositModal
        visible={!!depositGoal}
        goal={depositGoal}
        onClose={() => setDepositGoal(null)}
        onSuccess={handleSuccess}
      />

      {toast && (
        <Toast
          message={toast.message}
          color={toast.color}
          onHide={() => setToast(null)}
        />
      )}
      {pendingBadges.length > 0 && (
        <BadgeToast badges={pendingBadges} onDone={() => setPendingBadges([])} />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textDark, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14, padding: 12,
    borderLeftWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: '800' },
  statHint: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  timelineWrapper: {
    backgroundColor: Colors.white, borderRadius: 12,
    marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  timelineLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  timelineYear: { fontSize: 10, color: Colors.textMuted, marginTop: 1, textAlign: 'center' },
  loader: { marginTop: 32 },
  emptyState: { alignItems: 'center', paddingTop: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.textDark, marginBottom: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  newGoalBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  newGoalBtnPlus: { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 24 },
  newGoalBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  actionBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  actionSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
  },
  actionTitle: {
    fontSize: 15, fontWeight: '700', color: Colors.textDark,
    textAlign: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4,
  },
  actionBtn: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  actionBtnText: { fontSize: 16, fontWeight: '500', color: Colors.textDark },
  actionBtnCancel: { paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  actionCancelText: { fontSize: 16, fontWeight: '600', color: Colors.textMuted },
})
