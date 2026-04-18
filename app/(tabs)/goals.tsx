import React, { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Modal, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { GoalCard } from '../../components/GoalCard'
import { NewGoalModal } from '../../components/NewGoalModal'
import { GoalDepositModal } from '../../components/GoalDepositModal'
import { Toast } from '../../components/Toast'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import { Goal } from '../../types'
import { calcFV, brl } from '../../lib/finance'

const TIMELINE = [
  { label: 'Hoje', offset: 0, color: Colors.primary },
  { label: '5 anos', offset: 5, color: Colors.success },
  { label: '10 anos', offset: 10, color: Colors.warning },
  { label: '30 anos', offset: 30, color: '#534AB7' },
]

const now = new Date().getFullYear()

export default function GoalsScreen() {
  const { user } = useAuthStore()

  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [showNewGoal, setShowNewGoal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null)
  const [actionGoal, setActionGoal] = useState<Goal | null>(null)

  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)

  const loadGoals = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('horizon_years', { ascending: true })
      setGoals((data as Goal[]) ?? [])
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

  const totalCurrent = goals.reduce((s, g) => s + g.current_amount, 0)
  const totalProjected = goals.reduce((s, g) => {
    if (!g.monthly_deposit || !g.interest_rate) return s + g.current_amount
    return s + calcFV(g.monthly_deposit, g.interest_rate, g.horizon_years)
  }, 0)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Metas de longo prazo</Text>

        {/* Summary */}
        {goals.length > 0 && (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: Colors.lightBlue }]}>
              <Text style={styles.summaryLabel}>Total alocado</Text>
              <Text style={[styles.summaryValue, { color: Colors.primary }]}>{brl(totalCurrent)}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#F3F0FF' }]}>
              <Text style={styles.summaryLabel}>Total projetado</Text>
              <Text style={[styles.summaryValue, { color: '#534AB7' }]}>{brl(totalProjected)}</Text>
            </View>
          </View>
        )}

        {/* Timeline */}
        <View style={styles.timelineContainer}>
          <View style={styles.timelineLine} />
          {TIMELINE.map((t, i) => (
            <View key={t.label} style={styles.timelineMark}>
              <View style={[styles.timelineDot, { backgroundColor: t.color }]} />
              <Text style={[styles.timelineLabel, { color: t.color }]}>{t.label}</Text>
              <Text style={styles.timelineYear}>{t.offset === 0 ? now : now + t.offset}</Text>
            </View>
          ))}
        </View>

        {/* Add goal button */}
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowNewGoal(true)}>
          <Text style={styles.addBtnText}>+ Nova meta</Text>
        </TouchableOpacity>

        {/* Goals list */}
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        ) : goals.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyTitle}>Nenhuma meta ainda</Text>
            <Text style={styles.emptyText}>Toque em "+ Nova meta" para começar.</Text>
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

        <View style={{ height: 32 }} />
      </ScrollView>

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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textDark, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 14 },
  summaryLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: '800' },
  timelineContainer: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 20,
    backgroundColor: Colors.white, borderRadius: 12,
    padding: 16, position: 'relative',
  },
  timelineLine: {
    position: 'absolute', left: 36, right: 36,
    top: 24, height: 2, backgroundColor: Colors.border,
  },
  timelineMark: { alignItems: 'center', zIndex: 1, flex: 1 },
  timelineDot: {
    width: 16, height: 16, borderRadius: 8,
    marginBottom: 6, borderWidth: 2, borderColor: Colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15, shadowRadius: 2, elevation: 2,
  },
  timelineLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  timelineYear: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  addBtn: {
    backgroundColor: Colors.lightBlue, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginBottom: 20,
    borderWidth: 1.5, borderColor: Colors.primary + '40',
    borderStyle: 'dashed',
  },
  addBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  loader: { marginTop: 32 },
  emptyState: { alignItems: 'center', paddingTop: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.textDark, marginBottom: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
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
