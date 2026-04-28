import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { Colors } from '../../constants/colors'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { getCycle } from '../../lib/cycle'
import { getPotsHistoryBatch } from '../../lib/pot-history'
import { getPotIcon } from '../../lib/potIcons'

const COL = { month: 52, value: 108 }
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatMonthLabel(start: Date): string {
  return MONTH_NAMES[start.getMonth()] + '/' + String(start.getFullYear()).slice(2)
}

function formatBillingDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function formatPurchaseDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

type MonthRow = {
  label: string
  income: number
  expense: number
  saldo: number
  offset: number
  cycleStartISO: string
  cycleEndISO: string
  installmentsTotal: number
  isCurrent: boolean
}

export default function ProjectionScreen() {
  const { user } = useAuthStore()
  const [rows, setRows] = useState<MonthRow[]>([])
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [avgExpense, setAvgExpense] = useState(0)
  const [creditInstallments, setCreditInstallments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCreditMonth, setSelectedCreditMonth] = useState<MonthRow | null>(null)

  useFocusEffect(
    useCallback(() => {
      loadProjectionData()
    }, [user?.id, user?.cycle_start])
  )

  async function loadProjectionData() {
    if (!user) return
    setLoading(true)
    try {
      const userId = user.id
      const cycleStartDay = user.cycle_start ?? 1

      // Range global: 6 meses atrás até 12 meses à frente
      const globalStart = getCycle(cycleStartDay, -6).startISO
      const globalEnd = getCycle(cycleStartDay, 12).endISO
      // ── Fase 1: transactions + income (3 queries paralelas) ──
      const [
        { data: sources },
        { data: txsByDate },
        { data: txsByBilling },
      ] = await Promise.all([
        supabase.from('income_sources').select('amount').eq('user_id', userId),
        supabase.from('transactions')
          .select('type, amount, payment_method, date, pot_id')
          .eq('user_id', userId)
          .gte('date', globalStart).lte('date', globalEnd),
        supabase.from('transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('payment_method', 'credit')
          .not('billing_date', 'is', null)
          .gte('billing_date', globalStart).lte('billing_date', globalEnd)
          .order('billing_date', { ascending: true }),
      ])

      const base = ((sources ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)
      setMonthlyIncome(base)

      const allByDate = (txsByDate ?? []) as any[]
      const rawCredit = (txsByBilling ?? []) as any[]

      // ── Detectar meses anteriores com lançamentos reais ──
      const pastOffsets: number[] = []
      for (let offset = -1; offset >= -6; offset--) {
        const cycle = getCycle(cycleStartDay, offset)
        const hasExpense = allByDate.some(t =>
          (t.type === 'expense' || t.type === 'goal_deposit') &&
          t.payment_method !== 'credit' &&
          t.date >= cycle.startISO && t.date <= cycle.endISO
        )
        const hasCredit = rawCredit.some(t =>
          t.billing_date >= cycle.startISO && t.billing_date <= cycle.endISO
        )
        if (hasExpense || hasCredit) {
          pastOffsets.push(offset)
          if (pastOffsets.length >= 3) break
        } else {
          break
        }
      }

      const pastCount = pastOffsets.length
      const futureCount = 13 - 1 - pastCount
      const allOffsets = [
        ...pastOffsets.slice().reverse(),
        0,
        ...Array.from({ length: futureCount }, (_, i) => i + 1),
      ]

      // ── Fase 2: potes com histórico por mês (apenas 2 queries) ──
      const potsPorMes = await getPotsHistoryBatch(userId, cycleStartDay, allOffsets)

      // Construir potsMap para o modal de parcelas (sem query extra)
      const globalPotsMap: Record<string, any> = {}
      for (const monthPots of Object.values(potsPorMes)) {
        for (const p of monthPots as any[]) {
          globalPotsMap[p.id] = p
        }
      }
      const allCredit = rawCredit.map((t: any) => ({
        ...t,
        pots: t.pot_id ? (globalPotsMap[t.pot_id] ?? null) : null,
      }))
      setCreditInstallments(allCredit)

      // ── Construir rows usando limites corretos por mês ──
      const built: MonthRow[] = []

      for (const offset of allOffsets) {
        const cycle = getCycle(cycleStartDay, offset)
        const isFuture = offset > 0
        const isCurrent = offset === 0

        let income: number
        let expense: number
        if (isFuture) {
          // Futuro: orçado do mês específico + excedente parcelas + lançamentos reais
          const potsDoMes: any[] = potsPorMes[offset] ?? []
          const totalBudgetedDoMes = potsDoMes.reduce((s, p) => s + Number(p.limit_amount || 0), 0)

          const creditInMonth = allCredit
            .filter(t => t.billing_date >= cycle.startISO && t.billing_date <= cycle.endISO)

          const parcelasPorPote: Record<string, number> = {}
          let excedenteParcelas = 0
          for (const t of creditInMonth) {
            if (!t.pot_id) {
              excedenteParcelas += Number(t.amount)
            } else {
              parcelasPorPote[t.pot_id] = (parcelasPorPote[t.pot_id] ?? 0) + Number(t.amount)
            }
          }
          for (const [potId, totalParcelas] of Object.entries(parcelasPorPote)) {
            const pot = potsDoMes.find((p: any) => p.id === potId)
            const limite = Number(pot?.limit_amount || 0)
            if (limite <= 0) excedenteParcelas += totalParcelas
            else if (totalParcelas > limite) excedenteParcelas += totalParcelas - limite
          }

          const realIncome = allByDate
            .filter(t => t.type === 'income' && t.date >= cycle.startISO && t.date <= cycle.endISO)
            .reduce((s: number, t: any) => s + Number(t.amount), 0)
          const realExpense = allByDate
            .filter(t => (t.type === 'expense' || t.type === 'goal_deposit') && t.payment_method !== 'credit' && t.date >= cycle.startISO && t.date <= cycle.endISO)
            .reduce((s: number, t: any) => s + Number(t.amount), 0)

          income = base + realIncome
          expense = totalBudgetedDoMes + excedenteParcelas + realExpense
        } else {
          // Passado e atual: dados reais (crédito por billing_date, restante por date)
          const incomeActual = allByDate
            .filter(t => t.type === 'income' && t.date >= cycle.startISO && t.date <= cycle.endISO)
            .reduce((s: number, t: any) => s + Number(t.amount), 0)
          const expenseNonCredit = allByDate
            .filter(t => (t.type === 'expense' || t.type === 'goal_deposit') && t.payment_method !== 'credit' && t.date >= cycle.startISO && t.date <= cycle.endISO)
            .reduce((s: number, t: any) => s + Number(t.amount), 0)
          const expenseCredit = allCredit
            .filter(t => t.billing_date >= cycle.startISO && t.billing_date <= cycle.endISO)
            .reduce((s: number, t: any) => s + Number(t.amount), 0)

          income = base + incomeActual
          expense = expenseNonCredit + expenseCredit
        }

        const installmentsTotal = allCredit
          .filter(t => t.billing_date >= cycle.startISO && t.billing_date <= cycle.endISO)
          .reduce((s: number, t: any) => s + Number(t.amount), 0)

        const shortLabel = formatMonthLabel(cycle.start)
        built.push({
          label: shortLabel,
          income,
          expense,
          saldo: income - expense,
          offset,
          cycleStartISO: cycle.startISO,
          cycleEndISO: cycle.endISO,
          installmentsTotal,
          isCurrent,
        })
      }

      setRows(built)

      const last3 = built.filter(m => [0, -1, -2].includes(m.offset))
      const fallbackBudget = (potsPorMes[0] ?? []).reduce((s: number, p: any) => s + Number(p.limit_amount || 0), 0)
      setAvgExpense(
        last3.length > 0
          ? last3.reduce((s, m) => s + m.expense, 0) / last3.length
          : fallbackBudget
      )
    } finally {
      setLoading(false)
    }
  }

  const selectedCreditTxs = selectedCreditMonth
    ? creditInstallments.filter(t =>
        t.billing_date >= selectedCreditMonth.cycleStartISO &&
        t.billing_date <= selectedCreditMonth.cycleEndISO
      )
    : []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Projeção</Text>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Summary cards */}
            <View style={styles.summaryRow}>
              <View style={[styles.stat, { borderLeftColor: Colors.success }]}>
                <Text style={styles.statLabel}>💰 Receita base mensal</Text>
                <Text style={[styles.statValue, { color: Colors.success }]}>{brl(monthlyIncome)}</Text>
                <Text style={styles.statHint}>Fontes de receita</Text>
              </View>
              <View style={[styles.stat, { borderLeftColor: Colors.warning }]}>
                <Text style={styles.statLabel}>📊 Gasto médio mensal</Text>
                <Text style={[styles.statValue, { color: Colors.warning }]}>{brl(avgExpense)}</Text>
                <Text style={styles.statHint}>Mês atual + 2 anteriores</Text>
              </View>
            </View>

            {/* Table */}
            <View style={styles.table}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  {/* Header */}
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHCell, { width: COL.month, paddingLeft: 8 }]}>Mês</Text>
                    <Text style={[styles.tableHCell, { width: COL.value, textAlign: 'right', color: Colors.success }]}>
                      💰 Receita
                    </Text>
                    <Text style={[styles.tableHCell, { width: COL.value, textAlign: 'right', color: Colors.danger }]}>
                      📊 Despesa
                    </Text>
                    <Text style={[styles.tableHCell, { width: COL.value, textAlign: 'right', paddingRight: 12 }]}>
                      💹 Saldo
                    </Text>
                  </View>

                  {rows.map((row, i) => {
                    const isFuture = row.offset > 0
                    const hasCredit = row.installmentsTotal > 0
                    return (
                      <TouchableOpacity
                        key={i}
                        activeOpacity={hasCredit ? 0.7 : 1}
                        onPress={() => { if (hasCredit) setSelectedCreditMonth(row) }}
                      >
                        <View style={[
                          styles.tableRow,
                          isFuture && styles.futureRow,
                          { borderLeftWidth: hasCredit ? 3 : 0, borderLeftColor: Colors.warning },
                        ]}>
                          <Text style={[
                            styles.tableCell,
                            { width: COL.month, paddingLeft: 8, fontWeight: row.isCurrent ? '700' : '400' },
                            isFuture && styles.futureCellText,
                          ]}>
                            {row.label}
                          </Text>
                          <Text style={[styles.tableCell, { width: COL.value, textAlign: 'right', color: Colors.success }]}>
                            {brl(row.income)}
                          </Text>
                          <View style={{ width: COL.value, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <Text style={[styles.tableCell, { color: row.expense > 0 ? Colors.danger : Colors.textMuted }]}>
                              {brl(row.expense)}
                            </Text>
                            {hasCredit && (
                              <Text style={{ fontSize: 9, color: Colors.warning, marginLeft: 2 }}>💳</Text>
                            )}
                          </View>
                          <View style={{ width: COL.value, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 12 }}>
                            <Text style={[styles.tableCell, { color: row.saldo >= 0 ? Colors.success : Colors.danger }]}>
                              {brl(row.saldo)}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    )
                  })}

                  {/* Totals */}
                  {rows.length > 0 && (() => {
                    const totalInc = rows.reduce((s, r) => s + r.income, 0)
                    const totalExp = rows.reduce((s, r) => s + r.expense, 0)
                    const totalSaldo = totalInc - totalExp
                    return (
                      <View style={styles.totalRow}>
                        <Text style={[styles.totalCell, { width: COL.month, paddingLeft: 8 }]}>TOTAL</Text>
                        <Text style={[styles.totalCell, { width: COL.value, textAlign: 'right', color: Colors.success }]}>{brl(totalInc)}</Text>
                        <Text style={[styles.totalCell, { width: COL.value, textAlign: 'right', color: Colors.danger }]}>{brl(totalExp)}</Text>
                        <Text style={[styles.totalCell, { width: COL.value, textAlign: 'right', paddingRight: 12, color: totalSaldo >= 0 ? Colors.success : Colors.danger }]}>
                          {brl(totalSaldo)}
                        </Text>
                      </View>
                    )
                  })()}
                </View>
              </ScrollView>
            </View>

            {/* Card informativo */}
            <View style={{
              backgroundColor: Colors.lightBlue, borderRadius: 14, padding: 14, marginBottom: 16,
              borderWidth: 1, borderColor: Colors.primary,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 8 }}>
                📊 Como a projeção é calculada
              </Text>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ fontSize: 12 }}>✅</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted, flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: Colors.textDark }}>Meses passados: </Text>
                    gastos reais registrados
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ fontSize: 12 }}>📍</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted, flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: Colors.textDark }}>Mês atual: </Text>
                    gastos reais lançados até hoje
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ fontSize: 12 }}>🔮</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted, flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: Colors.textDark }}>Meses futuros: </Text>
                    orçamento dos potes + parcelas de cartão que excedem o valor orçado
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Credit installments modal */}
      <Modal
        visible={!!selectedCreditMonth}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCreditMonth(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={[styles.bottomSheet, { maxHeight: '80%' }]}>
            <View style={styles.handle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={styles.sheetTitle}>
                  💳 Cartão — {selectedCreditMonth?.label}
                </Text>
                <Text style={styles.sheetSubtitle}>Parcelas com vencimento neste mês</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedCreditMonth(null)}>
                <Text style={{ fontSize: 20, color: Colors.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedCreditTxs.map((t, i) => (
                <View key={t.id ?? i} style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Text style={[styles.entryDesc, { flex: 1, marginRight: 8 }]}>
                      {t.description ?? t.merchant ?? 'Sem descrição'}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.danger }}>
                      -{brl(Number(t.amount))}
                    </Text>
                  </View>
                  {(t.installment_total ?? 0) > 1 && (
                    <Text style={styles.entryMeta}>
                      Parcela {t.installment_number}/{t.installment_total}
                      {t.merchant ? ' · ' + t.merchant : ''}
                    </Text>
                  )}
                  <Text style={styles.entryMeta}>🛍️ Comprado em {formatPurchaseDate(t.date)}</Text>
                  <Text style={[styles.entryMeta, { color: Colors.warning }]}>📅 Vence {formatBillingDate(t.billing_date)}</Text>
                  {t.pots ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.pots.color ?? Colors.primary }} />
                      <Text style={{ fontSize: 11 }}>{getPotIcon(t.pots.name)}</Text>
                      <Text style={[styles.entryMeta, { marginTop: 0, fontStyle: 'italic' }]}>{t.pots.name}</Text>
                    </View>
                  ) : t.pot_id ? (
                    <Text style={[styles.entryMeta, { marginTop: 4, fontStyle: 'italic' }]}>🪣 Pote não identificado</Text>
                  ) : (
                    <Text style={[styles.entryMeta, { marginTop: 4, fontStyle: 'italic' }]}>🪣 Sem pote vinculado</Text>
                  )}
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16, marginTop: 8, borderTopWidth: 1.5, borderTopColor: Colors.border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textDark }}>Total no cartão</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.danger }}>
                  -{brl(selectedCreditMonth?.installmentsTotal ?? 0)}
                </Text>
              </View>
            </ScrollView>
            <TouchableOpacity onPress={() => setSelectedCreditMonth(null)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textDark, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  stat: {
    flex: 1, borderRadius: 12, padding: 12,
    backgroundColor: Colors.white, borderLeftWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '700' },
  statHint: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  table: {
    backgroundColor: Colors.white, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: Colors.lightBlue,
    paddingVertical: 10, paddingHorizontal: 0,
  },
  tableHCell: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  tableRow: {
    flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 0,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  futureRow: { backgroundColor: Colors.background },
  tableCell: { fontSize: 11, color: Colors.textDark },
  futureCellText: { color: Colors.textMuted, fontStyle: 'italic' },
  totalRow: {
    flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 0,
    backgroundColor: Colors.lightBlue,
    borderTopWidth: 1.5, borderTopColor: Colors.border,
  },
  totalCell: { fontSize: 11, fontWeight: '700', color: Colors.textDark },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '70%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: Colors.textDark },
  sheetSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  entryDesc: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  entryMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  closeBtn: { padding: 16, alignItems: 'center' },
  closeBtnText: { color: Colors.textMuted, fontSize: 14 },
})
