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
import ProjectionEntryModal, { ProjectionEntry } from '../../components/ProjectionEntryModal'
import { getPotIcon } from '../../lib/potIcons'

const COL = { month: 52, value: 108 }
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const FAB_SIZE = 52

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
  entries: ProjectionEntry[]
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
  const [fabOpen, setFabOpen] = useState(false)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income')
  const [editEntry, setEditEntry] = useState<ProjectionEntry | null>(null)
  const [selectedMonthRow, setSelectedMonthRow] = useState<MonthRow | null>(null)
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

      // Base income
      const { data: sources } = await supabase
        .from('income_sources').select('amount').eq('user_id', userId)
      const base = ((sources ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)
      setMonthlyIncome(base)

      // Total orçado dos potes ativos
      const { data: activePots } = await supabase
        .from('pots').select('limit_amount')
        .eq('user_id', userId).eq('is_emergency', false)
      const totalBudgeted = ((activePots ?? []) as any[])
        .reduce((s, p) => s + Number(p.limit_amount || 0), 0)

      // Todos os lançamentos de crédito (para modal e indicador)
      const { data: creditData } = await supabase
        .from('transactions').select('*')
        .eq('user_id', userId).eq('type', 'expense').eq('payment_method', 'credit')
        .not('billing_date', 'is', null)
        .order('billing_date', { ascending: true })
      const rawCredit = (creditData ?? []) as any[]

      // Join manual com potes para exibir nome/cor no modal
      const potIds = [...new Set(rawCredit.map((t: any) => t.pot_id).filter(Boolean))]
      let potsMap: Record<string, { id: string; name: string; color: string }> = {}
      if (potIds.length > 0) {
        const { data: potsData } = await supabase
          .from('pots').select('id, name, color').in('id', potIds)
        ;(potsData ?? []).forEach((p: any) => { potsMap[p.id] = p })
      }
      const allCredit = rawCredit.map((t: any) => ({
        ...t,
        pots: t.pot_id ? (potsMap[t.pot_id] ?? null) : null,
      }))
      setCreditInstallments(allCredit)

      // Projection entries
      const { data: allEntries } = await supabase
        .from('projection_entries').select('*').eq('user_id', userId)
      const projEntries = ((allEntries ?? []) as ProjectionEntry[])

      // Proração do mês atual
      const today = new Date()
      const currentCycle = getCycle(cycleStartDay, 0)
      const diasPassados = Math.max(1,
        Math.floor((today.getTime() - currentCycle.start.getTime()) / (1000 * 60 * 60 * 24))
      )

      // ── Detectar meses anteriores com lançamentos reais ──
      const pastOffsets: number[] = []
      for (let offset = -1; offset >= -6; offset--) {
        const cycle = getCycle(cycleStartDay, offset)
        const { data: probe } = await supabase
          .from('transactions').select('id').eq('user_id', userId).eq('type', 'expense')
          .or(
            `and(payment_method.neq.credit,date.gte.${cycle.startISO},date.lte.${cycle.endISO}),` +
            `and(payment_method.eq.credit,billing_date.gte.${cycle.startISO},billing_date.lte.${cycle.endISO})`
          ).limit(1)
        if (probe && probe.length > 0) {
          pastOffsets.push(offset)
          if (pastOffsets.length >= 3) break
        } else {
          break
        }
      }

      // Total = 13 linhas: passados + atual + futuros
      const pastCount = pastOffsets.length
      const futureCount = 13 - 1 - pastCount
      const allOffsets = [
        ...pastOffsets.slice().reverse(),
        0,
        ...Array.from({ length: futureCount }, (_, i) => i + 1),
      ]

      // ── Construir rows ──
      const built: MonthRow[] = []

      for (const offset of allOffsets) {
        const cycle = getCycle(cycleStartDay, offset)
        const isFuture = offset > 0
        const isCurrent = offset === 0

        const { data: txs } = await supabase
          .from('transactions')
          .select('type,amount,payment_method,billing_date,date')
          .eq('user_id', userId)
          .or(
            `and(payment_method.eq.credit,billing_date.gte.${cycle.startISO},billing_date.lte.${cycle.endISO}),` +
            `and(payment_method.neq.credit,date.gte.${cycle.startISO},date.lte.${cycle.endISO})`
          )

        const txList = (txs ?? []) as any[]
        const incomeActual = txList.filter(t => t.type === 'income')
          .reduce((s, t) => s + Number(t.amount), 0)
        const expenseActual = txList.filter(t => t.type === 'expense')
          .reduce((s, t) => s + Number(t.amount), 0)

        let income: number
        let expense: number

        if (isFuture) {
          income = base
          expense = totalBudgeted + expenseActual
        } else if (isCurrent) {
          income = base + incomeActual
          const gastoProjetado = (expenseActual / diasPassados) * 30
          expense = Math.min(gastoProjetado, totalBudgeted)
        } else {
          income = base + incomeActual
          expense = expenseActual
        }

        // Projection entries
        const monthEntries = projEntries.filter(e => e.cycle_start_date === cycle.startISO)
        income += monthEntries.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0)
        expense += monthEntries.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0)

        // Parcelas de crédito neste mês (para indicador e modal)
        const installmentsTotal = allCredit
          .filter(t => t.billing_date >= cycle.startISO && t.billing_date <= cycle.endISO)
          .reduce((s, t) => s + Number(t.amount), 0)

        const shortLabel = formatMonthLabel(cycle.start)
        built.push({
          label: isFuture ? shortLabel + ' *' : shortLabel,
          income,
          expense,
          saldo: income - expense,
          offset,
          cycleStartISO: cycle.startISO,
          cycleEndISO: cycle.endISO,
          entries: monthEntries,
          installmentsTotal,
          isCurrent,
        })
      }

      setRows(built)

      // avgExpense: mês atual + 2 anteriores (offsets 0, -1, -2)
      const last3 = built.filter(m => [0, -1, -2].includes(m.offset))
      setAvgExpense(
        last3.length > 0
          ? last3.reduce((s, m) => s + m.expense, 0) / last3.length
          : totalBudgeted
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteEntry(entryId: string) {
    await supabase.from('projection_entries').delete().eq('id', entryId)
    setSelectedMonthRow(null)
    loadProjectionData()
  }

  const selectedEntries = selectedMonthRow
    ? (rows.find(r => r.cycleStartISO === selectedMonthRow.cycleStartISO)?.entries ?? selectedMonthRow.entries)
    : []

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
                    const hasEntries = row.entries.length > 0
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
                            {hasEntries && (
                              <TouchableOpacity
                                onPress={() => setSelectedMonthRow(row)}
                                style={styles.entriesBadge}
                              >
                                <Text style={styles.entriesBadgeText}>+{row.entries.length}</Text>
                              </TouchableOpacity>
                            )}
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

            <Text style={styles.hint}>* Meses futuros usam orçamento dos potes + parcelas agendadas.</Text>
          </>
        )}
      </ScrollView>

      {/* FAB menu */}
      {fabOpen && (
        <View style={styles.fabMenu}>
          <TouchableOpacity
            onPress={() => { setEntryType('income'); setEditEntry(null); setShowEntryModal(true); setFabOpen(false) }}
            style={styles.fabMenuItem}
          >
            <Text style={[styles.fabMenuLabel, { color: Colors.success }]}>💰 Receita futura</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setEntryType('expense'); setEditEntry(null); setShowEntryModal(true); setFabOpen(false) }}
            style={styles.fabMenuItem}
          >
            <Text style={[styles.fabMenuLabel, { color: Colors.danger }]}>📋 Despesa futura</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setFabOpen(!fabOpen)} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>{fabOpen ? '✕' : '+'}</Text>
      </TouchableOpacity>

      {fabOpen && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFillObject as any, { zIndex: 8 }]}
          activeOpacity={1}
          onPress={() => setFabOpen(false)}
        />
      )}

      {/* Entries list modal */}
      <Modal
        visible={!!selectedMonthRow}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMonthRow(null)}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject as any}
          activeOpacity={1}
          onPress={() => setSelectedMonthRow(null)}
        />
        <View style={styles.bottomSheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>
            Lançamentos — {selectedMonthRow?.label?.replace(' *', '')}
          </Text>
          <ScrollView>
            {selectedEntries.map(entry => (
              <View key={entry.id} style={styles.entryRow}>
                <Text style={{ fontSize: 18, marginRight: 8 }}>
                  {entry.type === 'income' ? '💰' : '📋'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryDesc}>{entry.description}</Text>
                  <Text style={styles.entryMeta}>{entry.is_recurring ? '🔄 Recorrente' : 'Único'}</Text>
                </View>
                <Text style={[styles.entryAmount, { color: entry.type === 'income' ? Colors.success : Colors.danger }]}>
                  {entry.type === 'income' ? '+' : '-'}{brl(Number(entry.amount))}
                </Text>
                <TouchableOpacity
                  onPress={() => { setEditEntry(entry); setShowEntryModal(true); setSelectedMonthRow(null) }}
                  style={{ padding: 6 }}
                >
                  <Text>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteEntry(entry.id)} style={{ padding: 6 }}>
                  <Text>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={() => setSelectedMonthRow(null)} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

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
                  💳 Cartão — {selectedCreditMonth?.label?.replace(' *', '')}
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
                  {/* Descrição + valor */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Text style={[styles.entryDesc, { flex: 1, marginRight: 8 }]}>
                      {t.description ?? t.merchant ?? 'Sem descrição'}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.danger }}>
                      -{brl(Number(t.amount))}
                    </Text>
                  </View>
                  {/* Parcela + estabelecimento */}
                  {(t.installment_total ?? 0) > 1 && (
                    <Text style={styles.entryMeta}>
                      Parcela {t.installment_number}/{t.installment_total}
                      {t.merchant ? ' · ' + t.merchant : ''}
                    </Text>
                  )}
                  {/* Data da compra */}
                  <Text style={styles.entryMeta}>🛍️ Comprado em {formatPurchaseDate(t.date)}</Text>
                  {/* Vencimento */}
                  <Text style={[styles.entryMeta, { color: Colors.warning }]}>📅 Vence {formatBillingDate(t.billing_date)}</Text>
                  {/* Pote de origem */}
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

      <ProjectionEntryModal
        visible={showEntryModal}
        initialType={entryType}
        entry={editEntry ?? undefined}
        onClose={() => { setShowEntryModal(false); setEditEntry(null) }}
        onSuccess={loadProjectionData}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingBottom: 100 },
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
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, marginBottom: 12,
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
  entriesBadge: {
    backgroundColor: Colors.lightBlue, borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 2, marginLeft: 4,
  },
  entriesBadgeText: { fontSize: 9, color: Colors.primary, fontWeight: '700' },
  hint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6, zIndex: 10,
  },
  fabIcon: { fontSize: 24, color: '#fff', lineHeight: 28, fontWeight: '300' },
  fabMenu: {
    position: 'absolute', bottom: 92, right: 20,
    gap: 8, zIndex: 9,
  },
  fabMenuItem: {
    backgroundColor: Colors.white, borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  fabMenuLabel: { fontSize: 13, fontWeight: '600' },
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
  entryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  entryDesc: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  entryMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  entryAmount: { fontSize: 13, fontWeight: '700', marginRight: 4 },
  closeBtn: { padding: 16, alignItems: 'center' },
  closeBtnText: { color: Colors.textMuted, fontSize: 14 },
})
