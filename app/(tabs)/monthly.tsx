import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Animated, Alert,
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
import { useCycleStore } from '../../stores/useCycleStore'
import { supabase } from '../../lib/supabase'
import { getCycle, CycleInfo } from '../../lib/cycle'
import { calculateCycleSummary, CycleSummary, processCycleClose, recalculateRollover } from '../../lib/cycleClose'
import { fetchPotsForCycle } from '../../lib/pots'
import { getPotIcon } from '../../lib/potIcons'
import { brl } from '../../lib/finance'
import { Pot, Transaction, Goal } from '../../types'
import TransactionGroup from '../../components/TransactionGroup'
import { groupTransactionsByMerchantAndDate, groupByDate, formatDateHeader } from '../../lib/group-transactions'
import MonthPickerModal from '../../components/MonthPickerModal'

type TxWithPot = Transaction & { potName?: string; potColor?: string }

const FAB_SIZE = 52

export default function MonthlyScreen() {
  const { user } = useAuthStore()
  const { cycleOffset: offset, setCycleOffset: setOffset, viewMode, setViewMode, alertsExpanded, setAlertsExpanded } = useCycleStore()
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
  const [rolloverExists, setRolloverExists] = useState(false)
  const [reopening, setReopening] = useState(false)

  const [totalIncome, setTotalIncome] = useState(0)
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [showNewPot, setShowNewPot] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const fabAnim = useRef(new Animated.Value(0)).current
  const [showExpense, setShowExpense] = useState(false)
  const [showIncome, setShowIncome] = useState(false)
  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])

  function toggleViewMode(mode: 'tabela' | 'potes') {
    setViewMode(mode)
  }

  const cycle: CycleInfo = getCycle(user?.cycle_start ?? 1, offset)

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const nextCycleStart = getCycle(user.cycle_start ?? 1, offset + 1).startISO
      const [txNonCreditRes, txCreditRes, allPotsRes, epRes, goalsRes, sourcesRes, closedRes] = await Promise.all([
        // Non-credit: filter by date
        supabase.from('transactions').select('*').eq('user_id', user.id)
          .neq('payment_method', 'credit')
          .gte('date', cycle.startISO).lte('date', cycle.endISO)
          .order('date', { ascending: false }),
        // Credit: filter by billing_date (captures installments from prior months)
        supabase.from('transactions').select('*').eq('user_id', user.id)
          .eq('payment_method', 'credit')
          .not('billing_date', 'is', null)
          .gte('billing_date', cycle.startISO).lte('billing_date', cycle.endISO)
          .order('billing_date', { ascending: false }),
        fetchPotsForCycle(user.id, cycle.startISO, cycle.end.toISOString()),
        supabase.from('pots').select('*').eq('user_id', user.id).eq('is_emergency', true).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', user.id),
        supabase.from('income_sources').select('amount').eq('user_id', user.id),
        // Verificar se este ciclo já foi encerrado (tem rollover processado no próximo ciclo)
        supabase.from('cycle_rollovers').select('*')
          .eq('user_id', user.id).eq('cycle_start_date', nextCycleStart).maybeSingle(),
      ])

      const txs: Transaction[] = [
        ...((txNonCreditRes.data ?? []) as Transaction[]),
        ...((txCreditRes.data ?? []) as Transaction[]),
      ].sort((a, b) => {
        const dA = a.payment_method === 'credit' ? (a.billing_date ?? a.date) : a.date
        const dB = b.payment_method === 'credit' ? (b.billing_date ?? b.date) : b.date
        return dB.localeCompare(dA)
      })
      const pots = allPotsRes as Pot[]
      const ep = epRes.data as Pot | null
      const income = ((sourcesRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)

      setAllPots(pots)
      setEmergencyPot(ep)
      setTotalIncome(income)
      setGoals((goalsRes.data ?? []) as Goal[])
      setCycleClosed((closedRes.data as any)?.processed === true)
      setRolloverExists(!!closedRes.data)

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

  const handleReopenCycle = async () => {
    if (!user) return
    setReopening(true)
    try {
      const nextCycleStart = getCycle(user.cycle_start ?? 1, offset + 1).startISO
      await supabase.from('cycle_rollovers')
        .update({ processed: false })
        .eq('user_id', user.id)
        .eq('cycle_start_date', nextCycleStart)
      setCycleClosed(false)
      setToast({ message: 'Ciclo reaberto para edição.', color: Colors.warning })
      loadData()
    } finally {
      setReopening(false)
    }
  }

  const expPots = allPots.filter(p => !p.is_emergency)
  const txMerchantGroups = groupTransactionsByMerchantAndDate(transactions)
  const txByDate = groupByDate(txMerchantGroups)
  const txDates = Object.keys(txByDate).sort((a, b) => b.localeCompare(a))

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
          <TouchableOpacity style={styles.navBtn} onPress={() => setOffset(offset - 1)}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => setShowMonthPicker(true)}>
            <Text style={styles.cycleLabel}>{cycle.label} ▾</Text>
            <Text style={styles.cycleMonthYear}>{cycle.monthYear}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newPotBtn} onPress={() => setShowNewPot(true)}>
            <Text style={styles.newPotBtnText}>+ Pote</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, offset >= 0 && styles.navBtnDisabled]}
            onPress={() => offset < 0 && setOffset(offset + 1)}
            disabled={offset >= 0}
          >
            <Text style={[styles.navBtnText, offset >= 0 && { color: Colors.border }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Banner: ciclo reaberto para edição */}
        {rolloverExists && !cycleClosed && offset < 0 && (
          <View style={styles.reopenedBanner}>
            <Text style={styles.reopenedBannerText}>✏️ Ciclo reaberto para edição</Text>
          </View>
        )}

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

            {/* Card de avisos colapsável */}
            {summary && (() => {
              const avisos: { key: string; text: string; isRed: boolean }[] = []
              if (summary.cycleSaldo < 0) {
                avisos.push({
                  key: 'saldo',
                  text: `Saldo negativo em ${brl(Math.abs(summary.cycleSaldo))}. Ao encerrar, será descontado do próximo mês.`,
                  isRed: true,
                })
              }
              summary.potSummaries.filter(p => p.isOverBudget).forEach(p => {
                avisos.push({
                  key: p.id,
                  text: `O pote ${p.name} ultrapassou o limite em ${brl(Math.abs(p.remaining))}.`,
                  isRed: false,
                })
              })
              if (avisos.length === 0) return null
              const hasRed = avisos.some(a => a.isRed)
              return (
                <View style={[styles.alertCard, !hasRed && { backgroundColor: Colors.lightAmber, borderLeftColor: Colors.warning }]}>
                  <TouchableOpacity
                    onPress={() => setAlertsExpanded(!alertsExpanded)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 16 }}>⚠️</Text>
                      <Text style={[styles.alertTitle, { marginBottom: 0, color: hasRed ? Colors.danger : Colors.warning }]}>
                        {alertsExpanded ? 'Avisos do ciclo' : `Avisos (${avisos.length})`}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 16, color: hasRed ? Colors.danger : Colors.warning }}>
                      {alertsExpanded ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>
                  {alertsExpanded && (
                    <View style={{ marginTop: 10 }}>
                      {avisos.map(a => (
                        <Text key={a.key} style={[styles.alertText, { color: a.isRed ? Colors.danger : Colors.warning, marginBottom: 4 }]}>
                          • {a.text}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )
            })()}

            {/* Pot section with view toggle */}
            {summary && summary.potSummaries.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Potes</Text>

                {/* Toggle tabela / potes */}
                <View style={styles.viewToggle}>
                  <TouchableOpacity
                    onPress={() => toggleViewMode('tabela')}
                    style={[styles.viewToggleBtn, viewMode === 'tabela' && styles.viewToggleBtnActive]}
                  >
                    <Text style={[styles.viewToggleBtnText, viewMode === 'tabela' && styles.viewToggleBtnTextActive]}>
                      📊 Tabela
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => toggleViewMode('potes')}
                    style={[styles.viewToggleBtn, viewMode === 'potes' && styles.viewToggleBtnActive]}
                  >
                    <Text style={[styles.viewToggleBtnText, viewMode === 'potes' && styles.viewToggleBtnTextActive]}>
                      🫙 Potes
                    </Text>
                  </TouchableOpacity>
                </View>

                {viewMode === 'tabela' ? (
                  /* ── TABELA ── */
                  (() => {
                    const totalOrcado = summary.potSummaries.reduce((s, p) => s + (p.limit_amount ?? 0), 0)
                    const totalGasto = summary.totalExpense
                    const totalSaldo = summary.potSummaries.reduce((s, p) => s + p.remaining, 0)
                    return (
                      <View style={{ backgroundColor: Colors.white, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', backgroundColor: Colors.lightBlue, paddingVertical: 8, paddingHorizontal: 8 }}>
                          <Text style={{ flex: 2, fontSize: 11, fontWeight: '700', color: Colors.primary }}>Pote</Text>
                          <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: Colors.primary, textAlign: 'right' }}>Orçado</Text>
                          <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: Colors.danger, textAlign: 'right' }}>Gasto</Text>
                          <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: Colors.success, textAlign: 'right' }}>Saldo</Text>
                        </View>
                        {summary.potSummaries.map((pot, index) => (
                          <TouchableOpacity
                            key={pot.id}
                            onPress={() => router.push({
                              pathname: `/pot/${pot.id}`,
                              params: { cycleOffset: String(offset) },
                            })}
                            activeOpacity={0.7}
                            style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8, backgroundColor: index % 2 === 0 ? Colors.white : Colors.background, borderTopWidth: 0.5, borderTopColor: Colors.border, alignItems: 'center' }}
                          >
                            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                              <Text style={{ fontSize: 13 }}>{getPotIcon(pot.name)}</Text>
                              <Text style={{ fontSize: 11, color: Colors.textDark, flex: 1 }} numberOfLines={1}>{pot.name}</Text>
                              <Text style={{ fontSize: 10, color: Colors.textMuted }}>›</Text>
                            </View>
                            <Text style={{ flex: 1.2, fontSize: 11, color: Colors.textDark, textAlign: 'right' }} numberOfLines={1}>{brl(pot.limit_amount || 0)}</Text>
                            <Text style={{ flex: 1.2, fontSize: 11, color: pot.spent > 0 ? Colors.danger : Colors.textMuted, textAlign: 'right' }} numberOfLines={1}>{brl(pot.spent)}</Text>
                            <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '600', color: pot.remaining >= 0 ? Colors.success : Colors.danger, textAlign: 'right' }} numberOfLines={1}>{brl(pot.remaining)}</Text>
                          </TouchableOpacity>
                        ))}
                        <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8, backgroundColor: Colors.lightBlue, borderTopWidth: 1.5, borderTopColor: Colors.primary, alignItems: 'center' }}>
                          <Text style={{ flex: 2, fontSize: 12, fontWeight: '700', color: Colors.primary }}>TOTAL</Text>
                          <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: Colors.textDark, textAlign: 'right' }} numberOfLines={1}>{brl(totalOrcado)}</Text>
                          <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: Colors.danger, textAlign: 'right' }} numberOfLines={1}>{brl(totalGasto)}</Text>
                          <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: totalSaldo >= 0 ? Colors.success : Colors.danger, textAlign: 'right' }} numberOfLines={1}>{brl(totalSaldo)}</Text>
                        </View>
                      </View>
                    )
                  })()
                ) : (
                  /* ── CARDS ── */
                  <>
                    {summary.potSummaries.map(pot => {
                      const pct = pot.limit_amount && pot.limit_amount > 0
                        ? Math.min((pot.spent / pot.limit_amount) * 100, 100)
                        : 0
                      const barColor = pot.remaining < 0 ? Colors.danger
                        : pot.limit_amount && pot.spent / pot.limit_amount > 0.8 ? Colors.warning
                        : Colors.success
                      return (
                        <TouchableOpacity
                          key={pot.id}
                          activeOpacity={0.7}
                          onPress={() => router.push({
                            pathname: `/pot/${pot.id}`,
                            params: { cycleOffset: String(offset) },
                          })}
                          style={[styles.potCard, { borderLeftColor: pot.color || Colors.primary }]}
                        >
                          <View style={styles.potCardHeader}>
                            <Text style={{ fontSize: 16, marginRight: 6 }}>{getPotIcon(pot.name)}</Text>
                            <Text style={styles.potCardName} numberOfLines={1}>{pot.name}</Text>
                            <Text style={{ fontSize: 12, color: Colors.textMuted }}>›</Text>
                          </View>
                          <View style={styles.potCardValues}>
                            <View style={{ flex: 1, alignItems: 'flex-start' }}>
                              <Text style={styles.potCardValueLabel}>Orçado</Text>
                              <Text style={styles.potCardValue}>{brl(pot.limit_amount || 0)}</Text>
                            </View>
                            <View style={{ flex: 1, alignItems: 'center' }}>
                              <Text style={styles.potCardValueLabel}>Gasto</Text>
                              <Text style={[styles.potCardValue, { color: pot.spent > 0 ? Colors.danger : Colors.textMuted }]}>
                                {brl(pot.spent)}
                              </Text>
                            </View>
                            <View style={{ flex: 1, alignItems: 'flex-end' }}>
                              <Text style={styles.potCardValueLabel}>Saldo</Text>
                              <Text style={[styles.potCardValue, styles.potCardValueBold, { color: pot.remaining >= 0 ? Colors.success : Colors.danger }]}>
                                {brl(pot.remaining)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.potProgressBg}>
                            <View style={[styles.potProgressFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                    {/* Total card */}
                    {(() => {
                      const totalOrcado = summary.potSummaries.reduce((s, p) => s + (p.limit_amount ?? 0), 0)
                      const totalGasto = summary.totalExpense
                      const totalSaldo = summary.potSummaries.reduce((s, p) => s + p.remaining, 0)
                      return (
                        <View style={styles.potTotalCard}>
                          <Text style={styles.potTotalTitle}>Total</Text>
                          <View style={styles.potCardValues}>
                            <View style={{ flex: 1, alignItems: 'flex-start' }}>
                              <Text style={styles.potCardValueLabel}>Orçado</Text>
                              <Text style={[styles.potCardValue, styles.potCardValueBold]}>{brl(totalOrcado)}</Text>
                            </View>
                            <View style={{ flex: 1, alignItems: 'center' }}>
                              <Text style={styles.potCardValueLabel}>Gasto</Text>
                              <Text style={[styles.potCardValue, styles.potCardValueBold, { color: Colors.danger }]}>{brl(totalGasto)}</Text>
                            </View>
                            <View style={{ flex: 1, alignItems: 'flex-end' }}>
                              <Text style={styles.potCardValueLabel}>Saldo</Text>
                              <Text style={[styles.potCardValue, styles.potCardValueBold, { color: totalSaldo >= 0 ? Colors.success : Colors.danger }]}>{brl(totalSaldo)}</Text>
                            </View>
                          </View>
                        </View>
                      )
                    })()}
                  </>
                )}
              </View>
            )}

            {/* Lançamentos agrupados por estabelecimento */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lançamentos</Text>
              {txDates.length === 0 ? (
                <Text style={styles.empty}>Nenhum lançamento neste ciclo.</Text>
              ) : (
                txDates.map(date => (
                  <View key={date}>
                    <Text style={styles.dateHeader}>{formatDateHeader(date)}</Text>
                    <View style={styles.txGroupCard}>
                      {txByDate[date].map(group => (
                        <TransactionGroup
                          key={group.key}
                          transactions={group.transactions}
                          onEdit={t => setEditingTx(t as any)}
                          onDeleteGroup={txs => {
                            Alert.alert(
                              'Excluir lançamentos',
                              `Deseja excluir todos os ${txs.length} lançamentos de "${txs[0].merchant}"?\n\nTotal: ${brl(txs.reduce((s, t) => s + Number(t.amount), 0))}`,
                              [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                  text: 'Excluir todos', style: 'destructive',
                                  onPress: async () => {
                                    const ids = txs.map(t => t.id)
                                    const { error } = await supabase.from('transactions').delete().in('id', ids)
                                    if (error) { Alert.alert('Erro', 'Não foi possível excluir.'); return }
                                    setToast({ message: `${ids.length} lançamento${ids.length !== 1 ? 's' : ''} excluído${ids.length !== 1 ? 's' : ''}`, color: Colors.danger })
                                    loadData()
                                  },
                                },
                              ]
                            )
                          }}
                        />
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

            {/* Ciclo encerrado — botão reabrir */}
            {summary && cycleClosed && (
              <View style={styles.section}>
                <View style={styles.closedCard}>
                  <Text style={styles.closedTitle}>✅ Ciclo encerrado</Text>
                  <Text style={styles.closedSubtitle}>
                    Reabra para corrigir lançamentos e encerre novamente quando pronto.
                  </Text>
                  <TouchableOpacity
                    style={[styles.reopenBtn, reopening && { opacity: 0.6 }]}
                    onPress={handleReopenCycle}
                    disabled={reopening}
                  >
                    {reopening
                      ? <ActivityIndicator color={Colors.warning} />
                      : <Text style={styles.reopenBtnText}>Reabrir ciclo</Text>}
                  </TouchableOpacity>
                </View>
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

      <MonthPickerModal
        visible={showMonthPicker}
        currentOffset={offset}
        cycleStart={user?.cycle_start ?? 1}
        onSelect={(o) => setOffset(o)}
        onClose={() => setShowMonthPicker(false)}
      />

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
  viewToggle: {
    flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 20,
    padding: 3, alignSelf: 'flex-start', marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  viewToggleBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 },
  viewToggleBtnActive: { backgroundColor: Colors.primary },
  viewToggleBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  viewToggleBtnTextActive: { color: '#fff' },
  tableCard: {
    backgroundColor: Colors.white, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  tableHeaderRow: {
    flexDirection: 'row', backgroundColor: Colors.lightBlue,
    paddingVertical: 8, borderRadius: 8, marginBottom: 2,
  },
  tableHCell: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  tableDataRow: {
    flexDirection: 'row', paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  tableNameCell: { fontSize: 11, color: Colors.textDark, flex: 1 },
  tableValueCell: { fontSize: 11, color: Colors.textDark, textAlign: 'right' },
  tableTotalRow: {
    flexDirection: 'row', paddingVertical: 10,
    backgroundColor: Colors.lightBlue,
    borderTopWidth: 1.5, borderTopColor: Colors.primary,
  },
  tableTotalCell: { fontSize: 12, fontWeight: '700', color: Colors.textDark, textAlign: 'right' },
  potCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14, marginBottom: 8,
    borderLeftWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  potCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  potCardName: { fontSize: 14, fontWeight: '700', color: Colors.textDark, flex: 1 },
  potCardValues: { flexDirection: 'row', justifyContent: 'space-between' },
  potCardValueLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  potCardValue: { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  potCardValueBold: { fontWeight: '700' },
  potProgressBg: { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  potProgressFill: { height: 4, borderRadius: 2 },
  potTotalCard: {
    backgroundColor: Colors.lightBlue, borderRadius: 12, padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  potTotalTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 10 },
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
  reopenedBanner: {
    backgroundColor: '#FFF7ED', borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.warning,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  reopenedBannerText: { fontSize: 13, fontWeight: '600', color: Colors.warning },
  closedCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    borderLeftWidth: 3, borderLeftColor: Colors.success,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  closedTitle: { fontSize: 15, fontWeight: '700', color: Colors.success, marginBottom: 4 },
  closedSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 14 },
  reopenBtn: {
    borderWidth: 1.5, borderColor: Colors.warning, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  reopenBtnText: { fontSize: 14, fontWeight: '700', color: Colors.warning },
})
