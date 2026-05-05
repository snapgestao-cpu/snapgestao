import React, { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Modal, Alert, FlatList,
  TextInput, KeyboardAvoidingView, Platform,
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
import { useCycleStore } from '../../stores/useCycleStore'
import { Goal } from '../../types'
import { brl } from '../../lib/finance'
import { getCycle } from '../../lib/cycle'
import {
  getOrCreateReserve,
  getReserveTransactions,
  depositExternal,
  depositFromCycle,
  withdrawToCycle,
  EmergencyReserve,
  EmergencyTransaction,
} from '../../lib/emergency-reserve'

type TimelineItem = { year: number; label: string }

export default function GoalsScreen() {
  const { user } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { cycleOffset } = useCycleStore()

  const [goals, setGoals] = useState<Goal[]>([])
  const [urgentGoal, setUrgentGoal] = useState<Goal | null>(null)
  const [timelineYears, setTimelineYears] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [reserve, setReserve] = useState<EmergencyReserve | null>(null)
  const [reserveTxs, setReserveTxs] = useState<EmergencyTransaction[]>([])
  const [showReserveModal, setShowReserveModal] = useState(false)
  const [showReserveHistory, setShowReserveHistory] = useState(false)
  const [reserveAction, setReserveAction] = useState<'deposit_external' | 'deposit_from_cycle' | 'withdrawal_to_cycle'>('deposit_external')
  const [reserveAmountCents, setReserveAmountCents] = useState(0)
  const [reserveDesc, setReserveDesc] = useState('')
  const [reserveMonthOffset, setReserveMonthOffset] = useState(0)
  const [savingReserve, setSavingReserve] = useState(false)

  const [showNewGoal, setShowNewGoal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null)
  const [actionGoal, setActionGoal] = useState<Goal | null>(null)

  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])

  const loadGoals = useCallback(async () => {
    if (!user) return
    try {
      const [reserveData, goalsResult, txsData] = await Promise.all([
        getOrCreateReserve(user.id),
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', user.id)
          .order('horizon_years', { ascending: true }),
        getReserveTransactions(user.id),
      ])
      setReserve(reserveData)
      setReserveTxs(txsData)

      const loaded = (goalsResult.data as Goal[]) ?? []
      setGoals(loaded)

      const today = new Date().toISOString().split('T')[0]
      const urgent = loaded
        .filter(g => g.target_date != null && g.target_date >= today)
        .sort((a, b) => (a.target_date ?? '').localeCompare(b.target_date ?? ''))[0] ?? null
      setUrgentGoal(urgent)

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

  const actionTitle = {
    deposit_external: '💰 Depósito Externo',
    deposit_from_cycle: '↓ Transferir do Mês',
    withdrawal_to_cycle: '↑ Sacar para o Mês',
  }

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
            <View style={[styles.statCard, { borderLeftColor: Colors.primary }]}>
              <Text style={styles.statLabel}>🎯 Meta planejada</Text>
              <Text style={[styles.statValue, { color: Colors.primary }]} numberOfLines={1}>
                {brl(urgentGoal?.target_amount ?? 0)}
              </Text>
              <Text style={styles.statHint} numberOfLines={1}>
                {urgentGoal?.name ?? '—'}
              </Text>
            </View>

            <View style={[styles.statCard, { borderLeftColor: Colors.accent }]}>
              <Text style={styles.statLabel}>💰 Já alocado</Text>
              <Text style={[styles.statValue, { color: Colors.accent }]} numberOfLines={1}>
                {brl(urgentGoal?.current_amount ?? 0)}
              </Text>
              <Text style={styles.statHint}>
                de {brl(urgentGoal?.target_amount ?? 0)}
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

        {/* Card Reserva de Emergência */}
        {!loading && (
          <View style={styles.reserveCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 28, marginRight: 10 }}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.textDark }}>
                  Reserva de Emergência
                </Text>
                <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                  Fundo de segurança pessoal
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowReserveHistory(true)}
                style={{ padding: 8, backgroundColor: Colors.background, borderRadius: 10 }}
              >
                <Text style={{ fontSize: 18 }}>📋</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.reserveBalance}>
              <Text style={{ fontSize: 12, color: '#92400E', marginBottom: 4 }}>Saldo atual</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#D97706' }}>
                {(reserve?.current_amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </Text>
              {reserve?.target_amount ? (
                <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 4 }}>
                  Meta: {reserve.target_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </Text>
              ) : null}
            </View>

            {reserve?.target_amount ? (
              <View style={{ backgroundColor: Colors.border, borderRadius: 8, height: 8, marginBottom: 16 }}>
                <View style={{
                  backgroundColor: '#F59E0B',
                  borderRadius: 8,
                  height: 8,
                  width: `${Math.min(100, (reserve.current_amount / reserve.target_amount) * 100)}%` as any,
                }} />
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => { setReserveAction('deposit_external'); setShowReserveModal(true) }}
                style={[styles.reserveBtn, { backgroundColor: Colors.success }]}
              >
                <Text style={{ fontSize: 16 }}>💰</Text>
                <Text style={styles.reserveBtnText}>Depósito externo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setReserveAction('deposit_from_cycle'); setReserveMonthOffset(cycleOffset); setShowReserveModal(true) }}
                style={[styles.reserveBtn, { backgroundColor: Colors.primary }]}
              >
                <Text style={{ fontSize: 16 }}>↓</Text>
                <Text style={styles.reserveBtnText}>Do mês atual</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setReserveAction('withdrawal_to_cycle'); setReserveMonthOffset(cycleOffset); setShowReserveModal(true) }}
                style={[styles.reserveBtn, { backgroundColor: Colors.danger }]}
              >
                <Text style={{ fontSize: 16 }}>↑</Text>
                <Text style={styles.reserveBtnText}>Para o mês</Text>
              </TouchableOpacity>
            </View>
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

      {/* Modal de ação da reserva */}
      <Modal
        visible={showReserveModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReserveModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ backgroundColor: Colors.primary, padding: 20, paddingTop: 48, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
              {actionTitle[reserveAction]}
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.modalLabel}>Valor *</Text>
            <TextInput
              value={reserveAmountCents === 0 ? '' : (reserveAmountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '')
                setReserveAmountCents(parseInt(digits || '0', 10))
              }}
              placeholder="R$ 0,00"
              keyboardType="numeric"
              style={styles.amountInput}
            />

            <Text style={styles.modalLabel}>Descrição (opcional)</Text>
            <TextInput
              value={reserveDesc}
              onChangeText={setReserveDesc}
              placeholder="Ex: 13º salário, bônus..."
              style={styles.descInput}
            />

            {reserveAction !== 'deposit_external' && (
              <>
                <Text style={[styles.modalLabel, { marginTop: 8 }]}>Mês de referência</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <TouchableOpacity
                    onPress={() => setReserveMonthOffset(reserveMonthOffset - 1)}
                    style={styles.monthArrow}
                  >
                    <Text style={{ fontSize: 18 }}>‹</Text>
                  </TouchableOpacity>
                  <View style={styles.monthLabel}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.primary, textTransform: 'capitalize' }}>
                      {(() => {
                        const { start } = getCycle(user?.cycle_start || 1, reserveMonthOffset)
                        return start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                      })()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setReserveMonthOffset(reserveMonthOffset + 1)}
                    style={[styles.monthArrow, { backgroundColor: Colors.primary }]}
                  >
                    <Text style={{ fontSize: 18, color: '#fff' }}>›</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {reserveAction === 'withdrawal_to_cycle' && (reserveAmountCents / 100) > (reserve?.current_amount || 0) && (
              <View style={styles.warningBox}>
                <Text style={{ fontSize: 13, color: Colors.danger }}>
                  ⚠️ Valor maior que o saldo disponível ({(reserve?.current_amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={{ padding: 16, paddingBottom: 32, backgroundColor: Colors.white, borderTopWidth: 0.5, borderTopColor: Colors.border }}>
            <TouchableOpacity
              disabled={savingReserve || reserveAmountCents <= 0}
              onPress={async () => {
                setSavingReserve(true)
                try {
                  const amount = reserveAmountCents / 100
                  if (reserveAction === 'deposit_external') {
                    await depositExternal(user!.id, amount, reserveDesc)
                  } else if (reserveAction === 'deposit_from_cycle') {
                    await depositFromCycle(user!.id, amount, user?.cycle_start || 1, reserveMonthOffset, reserveDesc)
                  } else {
                    await withdrawToCycle(user!.id, amount, user?.cycle_start || 1, reserveMonthOffset, reserveDesc)
                  }
                  const updated = await getOrCreateReserve(user!.id)
                  setReserve(updated)
                  const txs = await getReserveTransactions(user!.id)
                  setReserveTxs(txs)
                  setShowReserveModal(false)
                  setReserveAmountCents(0)
                  setReserveDesc('')
                  setReserveMonthOffset(0)
                  setToast({ message: 'Operação realizada!', color: Colors.primary })
                } catch (err) {
                  Alert.alert('Erro', String(err))
                } finally {
                  setSavingReserve(false)
                }
              }}
              style={[styles.confirmBtn, { backgroundColor: reserveAmountCents <= 0 ? Colors.border : Colors.primary }]}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                {savingReserve ? 'Processando...' : 'Confirmar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de histórico da reserva */}
      <Modal
        visible={showReserveHistory}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReserveHistory(false)}
      >
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{
            backgroundColor: Colors.primary,
            padding: 20, paddingTop: 48,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <TouchableOpacity onPress={() => setShowReserveHistory(false)}>
              <Text style={{ color: '#fff', fontSize: 16 }}>Fechar</Text>
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>🛡️ Histórico da Reserva</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={{ backgroundColor: '#FFFBEB', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <Text style={{ fontSize: 12, color: '#92400E' }}>Saldo atual</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#D97706' }}>
              {(reserve?.current_amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </Text>
          </View>

          <FlatList
            data={reserveTxs}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16 }}
            onRefresh={async () => {
              const txs = await getReserveTransactions(user!.id)
              setReserveTxs(txs)
            }}
            refreshing={false}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', padding: 40 }}>
                <Text style={{ fontSize: 40 }}>🛡️</Text>
                <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 12, textAlign: 'center' }}>
                  Nenhuma movimentação ainda
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isDeposit = item.type !== 'withdrawal_to_cycle'
              const typeLabel: Record<string, string> = {
                deposit_external: 'Depósito externo',
                deposit_from_cycle: 'Do ciclo mensal',
                withdrawal_to_cycle: 'Saque para o mês',
              }

              return (
                <View style={styles.historyItem}>
                  <View style={[styles.historyIcon, { backgroundColor: isDeposit ? '#D1FAE5' : '#FEE2E2' }]}>
                    <Text style={{ fontSize: 18 }}>{isDeposit ? '↓' : '↑'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textDark }}>
                      {item.description || typeLabel[item.type]}
                    </Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {typeLabel[item.type]} · {new Date(item.created_at).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: isDeposit ? Colors.success : Colors.danger }}>
                    {isDeposit ? '+' : '-'}{item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </Text>
                </View>
              )
            }}
          />
        </View>
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
  reserveCard: {
    backgroundColor: Colors.white,
    borderRadius: 20, padding: 20, marginBottom: 16,
    borderWidth: 2, borderColor: '#F59E0B',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  reserveBalance: {
    backgroundColor: '#FFFBEB', borderRadius: 14,
    padding: 16, marginBottom: 16, alignItems: 'center',
  },
  reserveBtn: {
    flex: 1, borderRadius: 12, padding: 12, alignItems: 'center',
  },
  reserveBtnText: { fontSize: 11, color: '#fff', fontWeight: '600', marginTop: 4, textAlign: 'center' },
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
  modalLabel: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6 },
  amountInput: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    fontSize: 24, fontWeight: '700', color: Colors.textDark,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 16, textAlign: 'center',
  },
  descInput: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    fontSize: 15, color: Colors.textDark,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  monthArrow: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  monthLabel: {
    flex: 1, backgroundColor: Colors.lightBlue, borderRadius: 12,
    padding: 12, alignItems: 'center',
  },
  warningBox: {
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 16,
  },
  confirmBtn: {
    borderRadius: 16, padding: 18, alignItems: 'center',
  },
  historyItem: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  historyIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
})
