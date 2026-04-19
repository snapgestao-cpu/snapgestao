import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { NewExpenseModal } from '../../components/NewExpenseModal'
import { NewIncomeModal } from '../../components/NewIncomeModal'
import { NewPotModal } from '../../components/NewPotModal'
import { EditTransactionModal } from '../../components/EditTransactionModal'
import { ImportFileModal } from '../../components/ImportFileModal'
import { Toast } from '../../components/Toast'
import { BadgeToast } from '../../components/BadgeToast'
import { checkAndGrantBadges, Badge } from '../../lib/badges'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { getCycle, CycleInfo, formatDateShort } from '../../lib/cycle'
import { calculateCycleSummary, CycleSummary, processCycleClose, recalculateRollover } from '../../lib/cycleClose'
import { getPotIcon } from '../../lib/potIcons'
import { brl } from '../../lib/finance'
import { Pot, Transaction, Goal } from '../../types'

type TxWithPot = Transaction & { potName?: string; potColor?: string }
type TxGroup = { date: string; label: string; items: TxWithPot[] }

function groupTransactions(txs: TxWithPot[]): TxGroup[] {
  const map: Record<string, TxGroup> = {}
  for (const tx of txs) {
    if (!map[tx.date]) map[tx.date] = { date: tx.date, label: formatDateShort(tx.date), items: [] }
    map[tx.date].items.push(tx)
  }
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
}

const FAB_SIZE = 52

export default function MonthlyScreen() {
  const { user } = useAuthStore()
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [summary, setSummary] = useState<CycleSummary | null>(null)
  const [transactions, setTransactions] = useState<TxWithPot[]>([])
  const [allPots, setAllPots] = useState<Pot[]>([])
  const [emergencyPot, setEmergencyPot] = useState<Pot | null>(null)
  const [emergencyBalance, setEmergencyBalance] = useState(0)
  const [goals, setGoals] = useState<Goal[]>([])

  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [surplusAction, setSurplusAction] = useState<'goal' | 'emergency' | 'income' | 'discard' | null>(null)
  const [surplusGoalId, setSurplusGoalId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [cycleClosed, setCycleClosed] = useState(false)

  const [totalIncome, setTotalIncome] = useState(0)
  const [showNewPot, setShowNewPot] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const fabAnim = useRef(new Animated.Value(0)).current
  const [showExpense, setShowExpense] = useState(false)
  const [showIncome, setShowIncome] = useState(false)
  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])

  const cycle: CycleInfo = getCycle(user?.cycle_start ?? 1, offset)

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const nextCycleStart = getCycle(user.cycle_start ?? 1, offset + 1).startISO
      const [txRes, activePotsRes, deletedPotsRes, epRes, goalsRes, sourcesRes, closedRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', user.id)
          .or(
            `and(payment_method.eq.credit,billing_date.gte.${cycle.startISO},billing_date.lte.${cycle.endISO}),` +
            `and(payment_method.neq.credit,date.gte.${cycle.startISO},date.lte.${cycle.endISO})`
          )
          .order('date', { ascending: false }),
        // Potes ativos (sem deleted_at)
        supabase.from('pots').select('*')
          .eq('user_id', user.id)
          .eq('is_emergency', false)
          .is('deleted_at', null)
          .lte('created_at', cycle.end.toISOString())
          .order('created_at', { ascending: true }),
        // Potes excluídos que existiam durante o ciclo (deleted_at >= cycle.start)
        supabase.from('pots').select('*')
          .eq('user_id', user.id)
          .eq('is_emergency', false)
          .not('deleted_at', 'is', null)
          .lte('created_at', cycle.end.toISOString())
          .gte('deleted_at', cycle.startISO)
          .order('created_at', { ascending: true }),
        supabase.from('pots').select('*').eq('user_id', user.id).eq('is_emergency', true).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', user.id),
        supabase.from('income_sources').select('amount').eq('user_id', user.id),
        // Verificar se este ciclo já foi encerrado (tem rollover processado no próximo ciclo)
        supabase.from('cycle_rollovers').select('processed')
          .eq('user_id', user.id).eq('cycle_start_date', nextCycleStart).maybeSingle(),
      ])

      const txs = (txRes.data ?? []) as Transaction[]
      const activePots = (activePotsRes.data ?? []) as Pot[]
      const deletedPots = (deletedPotsRes.data ?? []) as Pot[]
      // Ciclo atual: só potes ativos; ciclos anteriores: inclui potes excluídos que existiam no período
      const pots = offset === 0 ? activePots : [...activePots, ...deletedPots]
      const ep = epRes.data as Pot | null
      const income = ((sourcesRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)

      setAllPots(pots)
      setEmergencyPot(ep)
      setTotalIncome(income)
      setGoals((goalsRes.data ?? []) as Goal[])
      setCycleClosed((closedRes.data as any)?.processed === true)

      const potMap = Object.fromEntries(pots.map(p => [p.id, p]))
      const txsWithPot: TxWithPot[] = txs.map(tx => ({
        ...tx,
        potName: tx.pot_id ? potMap[tx.pot_id]?.name : undefined,
        potColor: tx.pot_id ? potMap[tx.pot_id]?.color : undefined,
      }))
      setTransactions(txsWithPot)

      if (ep) {
        const { data: epTxs } = await supabase.from('transactions').select('amount, type')
          .eq('pot_id', ep.id)
        const bal = ((epTxs ?? []) as any[]).reduce((s: number, t: any) => {
          return t.type === 'income' ? s + Number(t.amount) : s - Number(t.amount)
        }, 0)
        setEmergencyBalance(bal)
      }

      const s = await calculateCycleSummary(user.id, cycle)
      setSummary(s)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, offset])

  useEffect(() => { setLoading(true); loadData() }, [loadData])

  const onRefresh = () => { setRefreshing(true); loadData() }

  const toggleFab = () => {
    const toValue = fabOpen ? 0 : 1
    Animated.spring(fabAnim, { toValue, useNativeDriver: true, bounciness: 6 }).start()
    setFabOpen(!fabOpen)
  }
  const closeFab = () => {
    if (!fabOpen) return
    Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true }).start()
    setFabOpen(false)
  }
  const fabRotate = fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })

  const FAB_ITEMS = [
    { key: 'import',  label: '+Arquivo',           color: '#534AB7',       icon: '📊' },
    { key: 'ocr',     label: 'Escanear cupom',     color: Colors.primary,  icon: '📷' },
    { key: 'income',  label: 'Registrar receita',  color: Colors.success,  icon: '↑' },
    { key: 'expense', label: 'Registrar gasto',    color: Colors.danger,   icon: '↓' },
  ]

  // For current cycle use today, for past cycles use cycle start
  const defaultDate = offset === 0
    ? new Date().toISOString().split('T')[0]
    : cycle.startISO

  const handleFabItem = (key: string) => {
    closeFab()
    if (key === 'expense') setShowExpense(true)
    else if (key === 'income') setShowIncome(true)
    else if (key === 'import') setShowImport(true)
    else if (key === 'ocr') {
      router.push({
        pathname: '/ocr',
        params: { cycleDate: cycle.start.toISOString().split('T')[0] },
      })
    }
  }

  const handleTxSuccess = (msg: string) => {
    loadData()
    setToast({ message: msg, color: Colors.primary })
  }

  const handleCycleClose = async () => {
    if (!user || !summary) return
    setClosing(true)
    try {
      const nextCycle = getCycle(user.cycle_start ?? 1, offset + 1)
      await processCycleClose(user.id, nextCycle.start, surplusAction ?? 'discard', surplusGoalId, summary)

      // Cascata: recalcular rollovers de ciclos posteriores já encerrados
      if (offset < 0) {
        for (let i = offset + 1; i <= 0; i++) {
          await recalculateRollover(user.id, user.cycle_start ?? 1, i)
        }
      }

      setCycleClosed(true)
      setToast({ message: 'Ciclo encerrado com sucesso!', color: Colors.success })
      loadData()
      checkAndGrantBadges(user.id, user.cycle_start ?? 1).then(b => { if (b.length > 0) setPendingBadges(b) })
    } finally {
      setClosing(false)
    }
  }

  // Potes sem deleted_at para lançamentos novos; allPots inclui soft-deleted ativos no ciclo (para tabela)
  const expPots = allPots.filter(p => !p.is_emergency && !p.deleted_at)
  const txGroups = groupTransactions(transactions)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        onScrollBeginDrag={closeFab}
        showsVerticalScrollIndicator={false}
      >
        {/* Cycle navigation */}
        <View style={styles.cycleNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setOffset(o => o - 1)}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.cycleLabel}>{cycle.label}</Text>
            <Text style={styles.cycleMonthYear}>{cycle.monthYear}</Text>
          </View>
          <TouchableOpacity style={styles.newPotBtn} onPress={() => setShowNewPot(true)}>
            <Text style={styles.newPotBtnText}>+ Pote</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, offset >= 0 && styles.navBtnDisabled]}
            onPress={() => offset < 0 && setOffset(o => o + 1)}
            disabled={offset >= 0}
          >
            <Text style={[styles.navBtnText, offset >= 0 && { color: Colors.border }]}>›</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Summary card */}
            {summary && (
              <View style={styles.summaryCard}>
                <SummaryRow label="Receita mensal esperada" value={brl(summary.monthlyIncome)} />
                {summary.totalIncome > 0 && (
                  <SummaryRow label="(+) Entradas recebidas" value={brl(summary.totalIncome)} />
                )}
                {summary.debtFromPrev > 0 && (
                  <SummaryRow label="(-) Débito mês anterior" value={brl(summary.debtFromPrev)} isNegative />
                )}
                {summary.surplusFromPrev > 0 && (
                  <SummaryRow label="(+) Sobra mês anterior" value={brl(summary.surplusFromPrev)} />
                )}
                <View style={styles.summaryDivider} />
                <SummaryRow label="(=) Receita disponível" value={brl(summary.availableIncome)} bold />
                <SummaryRow label="(-) Total gasto" value={brl(summary.totalExpense)} isNegative />
                <View style={styles.summaryDivider} />
                <View style={styles.summaryBalanceRow}>
                  <Text style={styles.summaryBalanceLabel}>(=) Saldo do ciclo</Text>
                  <Text style={[styles.summaryBalanceValue, { color: summary.cycleSaldo >= 0 ? '#4ADE80' : '#F87171' }]}>
                    {brl(summary.cycleSaldo)}
                  </Text>
                </View>
              </View>
            )}

            {/* Saldo negativo do ciclo */}
            {summary && summary.cycleSaldo < 0 && (
              <View style={styles.alertCard}>
                <Text style={styles.alertTitle}>⚠️ Atenção: saldo negativo</Text>
                <Text style={styles.alertText}>
                  O saldo deste ciclo está negativo em {brl(Math.abs(summary.cycleSaldo))}. Ao encerrar o ciclo, este valor será descontado do próximo mês.
                </Text>
              </View>
            )}
            {/* Pote individual ultrapassado (saldo geral ainda positivo) */}
            {summary && summary.cycleSaldo >= 0 && summary.potSummaries.some(p => p.isOverBudget) && (
              <View style={[styles.alertCard, { backgroundColor: Colors.lightAmber, borderLeftColor: Colors.warning }]}>
                {summary.potSummaries.filter(p => p.isOverBudget).map(p => (
                  <Text key={p.id} style={[styles.alertSuggestion, { color: Colors.warning }]}>
                    ⚠️ O pote {p.name} ultrapassou o limite em {brl(Math.abs(p.remaining))}. Considere revisar seu orçamento.
                  </Text>
                ))}
              </View>
            )}

            {/* Pot table */}
            {summary && summary.potSummaries.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Potes</Text>
                <View style={styles.tableCard}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ minWidth: 430 }}>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableHCell, { width: 130 }]}>Pote</Text>
                        <Text style={[styles.tableHCell, { width: 100 }]}>Orçado</Text>
                        <Text style={[styles.tableHCell, { width: 100 }]}>Gasto</Text>
                        <Text style={[styles.tableHCell, { width: 100 }]}>Saldo</Text>
                      </View>
                      {summary.potSummaries.map(pot => (
                        <View key={pot.id} style={styles.tableRow}>
                          <View style={{ width: 130, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ fontSize: 13 }}>{getPotIcon(pot.name)}</Text>
                            <Text style={styles.tableCellText} numberOfLines={1}>{pot.name}</Text>
                          </View>
                          <Text style={[styles.tableCell, { width: 100 }]}>{pot.limit_amount ? brl(pot.limit_amount) : '—'}</Text>
                          <Text style={[styles.tableCell, { width: 100, color: Colors.danger }]}>{brl(pot.spent)}</Text>
                          <Text style={[styles.tableCell, { width: 100, color: pot.isOverBudget ? Colors.danger : Colors.success, fontWeight: '700' }]}>
                            {brl(pot.remaining)}
                          </Text>
                        </View>
                      ))}
                      <View style={[styles.tableRow, styles.tableTotalRow]}>
                        <Text style={[styles.tableCell, styles.tableTotalText, { width: 130 }]}>Total</Text>
                        <Text style={[styles.tableCell, styles.tableTotalText, { width: 100 }]}>
                          {brl(summary.potSummaries.reduce((s, p) => s + (p.limit_amount ?? 0), 0))}
                        </Text>
                        <Text style={[styles.tableCell, styles.tableTotalText, { width: 100, color: Colors.danger }]}>
                          {brl(summary.totalExpense)}
                        </Text>
                        <Text style={[styles.tableCell, styles.tableTotalText, { width: 100, color: summary.cycleSaldo >= 0 ? Colors.success : Colors.danger }]}>
                          {brl(summary.potSummaries.reduce((s, p) => s + p.remaining, 0))}
                        </Text>
                      </View>
                    </View>
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Transactions grouped by date */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lançamentos</Text>
              {txGroups.length === 0 ? (
                <Text style={styles.empty}>Nenhum lançamento neste ciclo.</Text>
              ) : (
                txGroups.map(group => (
                  <View key={group.date}>
                    <Text style={styles.dateHeader}>{group.label}</Text>
                    <View style={styles.txGroupCard}>
                      {group.items.map(tx => (
                        <View key={tx.id} style={styles.txRow}>
                          <View style={styles.txLeft}>
                            {tx.potColor ? (
                              <View style={[styles.txDot, { backgroundColor: tx.potColor }]} />
                            ) : (
                              <Text style={styles.txTypeIcon}>{tx.type === 'income' ? '↑' : '↓'}</Text>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={styles.txDesc} numberOfLines={1}>
                                {tx.description ?? tx.merchant ?? 'Sem descrição'}
                              </Text>
                              {tx.potName ? (
                                <Text style={styles.txMeta}>{getPotIcon(tx.potName)} {tx.potName}</Text>
                              ) : null}
                            </View>
                          </View>
                          <Text style={[styles.txAmount, { color: tx.type === 'income' ? Colors.success : Colors.danger }]}>
                            {tx.type === 'income' ? '+' : '-'}{brl(tx.amount)}
                          </Text>
                          <TouchableOpacity
                            style={styles.editTxBtn}
                            onPress={() => setEditingTx(tx)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                          >
                            <Text style={styles.editTxIcon}>✏️</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Encerrar ciclo — qualquer ciclo ainda não encerrado */}
            {summary && !cycleClosed && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Encerrar ciclo</Text>
                {summary.cycleSaldo >= 0 ? (
                  <View style={styles.closeCard}>
                    <Text style={styles.closeTitle}>
                      🎉 Parabéns! Sobra de {brl(summary.totalSurplus)} este mês.
                    </Text>
                    <Text style={styles.closeSubtitle}>O que fazer com a sobra?</Text>
                    <View style={styles.surplusChips}>
                      {([
                        { key: 'goal', label: '→ Investir em meta' },
                        { key: 'emergency', label: '→ Emergência' },
                        { key: 'income', label: '→ Próximo mês' },
                        { key: 'discard', label: 'Ignorar' },
                      ] as const).map(opt => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.surplusChip, surplusAction === opt.key && styles.surplusChipActive]}
                          onPress={() => setSurplusAction(opt.key)}
                        >
                          <Text style={[styles.surplusChipText, surplusAction === opt.key && styles.surplusChipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {surplusAction === 'goal' && goals.length > 0 && (
                      <View style={styles.goalSelector}>
                        <Text style={styles.label}>Qual meta?</Text>
                        {goals.map(g => (
                          <TouchableOpacity
                            key={g.id}
                            style={[styles.goalChip, surplusGoalId === g.id && styles.goalChipActive]}
                            onPress={() => setSurplusGoalId(g.id)}
                          >
                            <Text style={[styles.goalChipText, surplusGoalId === g.id && { color: Colors.primary }]}>
                              🎯 {g.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.closeBtn, (!surplusAction || (surplusAction === 'goal' && !surplusGoalId)) && { opacity: 0.4 }]}
                      onPress={handleCycleClose}
                      disabled={closing || !surplusAction || (surplusAction === 'goal' && !surplusGoalId)}
                    >
                      {closing ? <ActivityIndicator color="#fff" /> : <Text style={styles.closeBtnText}>Encerrar e aplicar</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[styles.closeCard, { backgroundColor: Colors.lightRed }]}>
                    <Text style={styles.closeTitleRed}>
                      ⚠️ {brl(summary.totalDebt)} será descontado do próximo mês.
                    </Text>
                    <TouchableOpacity
                      style={[styles.closeBtn, { backgroundColor: Colors.danger }]}
                      onPress={handleCycleClose}
                      disabled={closing}
                    >
                      {closing ? <ActivityIndicator color="#fff" /> : <Text style={styles.closeBtnText}>Entendido — Encerrar ciclo</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Emergency pot */}
            {emergencyPot && (
              <View style={styles.section}>
                <View style={styles.emergencyCard}>
                  <View style={styles.emergencyHeader}>
                    <Text style={styles.emergencyIcon}>🛡️</Text>
                    <View>
                      <Text style={styles.emergencyTitle}>Pote de Emergência</Text>
                      <Text style={styles.emergencySubtitle}>{emergencyPot.name} · acumulado total</Text>
                    </View>
                  </View>
                  <Text style={styles.emergencyBalance}>{brl(emergencyBalance)}</Text>
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 96 }} />
      </ScrollView>

      {/* FAB — all cycles */}
      {FAB_ITEMS.map((item, i) => {
        const translateY = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -(FAB_SIZE + 12) * (i + 1)] })
        const opacity = fabAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] })
        return (
          <Animated.View
            key={item.key}
            style={[styles.fabMenuItem, { transform: [{ translateY }], opacity }]}
            pointerEvents={fabOpen ? 'auto' : 'none'}
          >
            <Text style={styles.fabMenuLabel}>{item.label}</Text>
            <TouchableOpacity
              style={[styles.fabMinor, { backgroundColor: item.color }]}
              onPress={() => handleFabItem(item.key)}
              activeOpacity={0.85}
            >
              <Text style={styles.fabIcon}>{item.icon}</Text>
            </TouchableOpacity>
          </Animated.View>
        )
      })}

      <TouchableOpacity style={styles.fab} onPress={toggleFab} activeOpacity={0.85}>
        <Animated.Text style={[styles.fabIcon, { transform: [{ rotate: fabRotate }] }]}>+</Animated.Text>
      </TouchableOpacity>

      {fabOpen && (
        <TouchableOpacity style={StyleSheet.absoluteFillObject as any} activeOpacity={1} onPress={closeFab} />
      )}

      <NewExpenseModal
        visible={showExpense}
        onClose={() => setShowExpense(false)}
        onSuccess={() => handleTxSuccess('Gasto registrado!')}
        pots={expPots}
        initialDate={defaultDate}
      />
      <NewIncomeModal
        visible={showIncome}
        onClose={() => setShowIncome(false)}
        onSuccess={() => handleTxSuccess('Receita registrada!')}
        initialDate={defaultDate}
      />


      <EditTransactionModal
        visible={!!editingTx}
        transaction={editingTx}
        pots={expPots}
        onClose={() => setEditingTx(null)}
        onSuccess={msg => { setEditingTx(null); handleTxSuccess(msg) }}
      />
      <NewPotModal
        visible={showNewPot}
        onClose={() => setShowNewPot(false)}
        onSuccess={msg => { setShowNewPot(false); handleTxSuccess(msg); }}
        totalIncome={totalIncome}
        cycleStartDate={cycle.start}
        isRetroactive={offset < 0}
      />
      <ImportFileModal
        visible={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={msg => { setShowImport(false); handleTxSuccess(msg) }}
        pots={expPots}
        userId={user?.id ?? ''}
        cycleStartISO={cycle.startISO}
        cycleEndISO={cycle.endISO}
      />
      {toast && <Toast message={toast.message} color={toast.color} onHide={() => setToast(null)} />}
      {pendingBadges.length > 0 && (
        <BadgeToast badges={pendingBadges} onDone={() => setPendingBadges([])} />
      )}
    </SafeAreaView>
  )
}

function SummaryRow({ label, value, bold, isNegative }: { label: string; value: string; bold?: boolean; isNegative?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryRowLabel, bold && { fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.summaryRowValue, bold && { fontWeight: '800' }, isNegative && { color: '#F87171' }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 16 },
  cycleNav: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 12, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { fontSize: 28, color: Colors.primary, fontWeight: '300' },
  newPotBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.lightBlue, paddingHorizontal: 12,
    paddingVertical: 6, borderRadius: 20, marginRight: 4,
  },
  newPotBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  cycleLabel: { fontSize: 14, fontWeight: '700', color: Colors.textDark, textAlign: 'center' },
  cycleMonthYear: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
  summaryCard: {
    backgroundColor: Colors.primaryDark, borderRadius: 16,
    padding: 18, marginBottom: 16,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryRowLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  summaryRowValue: { fontSize: 13, color: '#fff', fontWeight: '600' },
  summaryDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 8 },
  summaryBalanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  summaryBalanceLabel: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  summaryBalanceValue: { fontSize: 20, fontWeight: '900' },
  alertCard: {
    backgroundColor: Colors.lightRed, borderRadius: 12,
    borderLeftWidth: 4, borderLeftColor: Colors.danger,
    padding: 14, marginBottom: 16,
  },
  alertTitle: { fontSize: 14, fontWeight: '700', color: Colors.danger, marginBottom: 6 },
  alertText: { fontSize: 13, color: Colors.danger, marginBottom: 6 },
  alertSuggestion: { fontSize: 12, color: Colors.danger, marginTop: 3 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textDark, marginBottom: 10 },
  tableCard: {
    backgroundColor: Colors.white, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.lightBlue, paddingVertical: 8, paddingHorizontal: 12 },
  tableHCell: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tableCell: { fontSize: 12, color: Colors.textDark },
  tableCellText: { fontSize: 12, color: Colors.textDark, flex: 1 },
  tableTotalRow: { backgroundColor: Colors.background, borderBottomWidth: 0 },
  tableTotalText: { fontWeight: '700' },
  dateHeader: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 6, marginTop: 4 },
  txGroupCard: {
    backgroundColor: Colors.white, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    marginBottom: 8,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  txLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 },
  txDot: { width: 10, height: 10, borderRadius: 5 },
  txTypeIcon: { fontSize: 16, color: Colors.textMuted, width: 16, textAlign: 'center' },
  txDesc: { fontSize: 14, fontWeight: '500', color: Colors.textDark },
  txMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700', marginRight: 8 },
  editTxBtn: { padding: 4 },
  editTxIcon: { fontSize: 14 },
  empty: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 8 },
  closeCard: {
    backgroundColor: Colors.lightGreen, borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  closeTitle: { fontSize: 15, fontWeight: '700', color: Colors.success, marginBottom: 8 },
  closeTitleRed: { fontSize: 15, fontWeight: '700', color: Colors.danger, marginBottom: 12 },
  closeSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 10 },
  surplusChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  surplusChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  surplusChipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  surplusChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  surplusChipTextActive: { color: Colors.primary },
  goalSelector: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textDark, marginBottom: 6 },
  goalChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white, marginBottom: 6,
  },
  goalChipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  goalChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  closeBtn: {
    backgroundColor: Colors.success, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  closeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emergencyCard: {
    backgroundColor: '#F3F0FF', borderRadius: 14, padding: 16,
    borderLeftWidth: 3, borderLeftColor: '#534AB7',
  },
  emergencyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  emergencyIcon: { fontSize: 28 },
  emergencyTitle: { fontSize: 15, fontWeight: '700', color: '#534AB7' },
  emergencySubtitle: { fontSize: 12, color: Colors.textMuted },
  emergencyBalance: { fontSize: 24, fontWeight: '900', color: '#534AB7' },
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6, zIndex: 10,
  },
  fabMinor: {
    width: FAB_SIZE - 6, height: FAB_SIZE - 6, borderRadius: (FAB_SIZE - 6) / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  fabMenuItem: {
    position: 'absolute', bottom: 28, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 9,
  },
  fabMenuLabel: {
    backgroundColor: Colors.white, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    fontSize: 13, fontWeight: '600', color: Colors.textDark,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 3,
  },
  fabIcon: { fontSize: 24, color: '#fff', lineHeight: 28, fontWeight: '300' },
})
