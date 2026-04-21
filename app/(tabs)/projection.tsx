import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { Colors } from '../../constants/colors'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { getCycle } from '../../lib/cycle'
import ProjectionEntryModal, { ProjectionEntry } from '../../components/ProjectionEntryModal'

const COL = { month: 72, value: 108 }

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type MonthRow = {
  label: string
  income: number
  expense: number
  saldo: number
  offset: number
  cycleStartISO: string
  entries: ProjectionEntry[]
}

const FAB_SIZE = 52

export default function ProjectionScreen() {
  const { user } = useAuthStore()
  const [rows, setRows] = useState<MonthRow[]>([])
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [avgExpense, setAvgExpense] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fabOpen, setFabOpen] = useState(false)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income')
  const [editEntry, setEditEntry] = useState<ProjectionEntry | null>(null)
  const [selectedMonthRow, setSelectedMonthRow] = useState<MonthRow | null>(null)

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

      // Base income from sources
      const { data: sources } = await supabase
        .from('income_sources').select('amount').eq('user_id', userId)
      const base = ((sources ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)
      setMonthlyIncome(base)

      // Total orçado dos potes ativos (excluindo emergência)
      const { data: activePots } = await supabase
        .from('pots').select('limit_amount')
        .eq('user_id', userId).eq('is_emergency', false)
      const totalBudgeted = ((activePots ?? []) as any[])
        .reduce((s, p) => s + Number(p.limit_amount || 0), 0)

      // All projection_entries for this user
      const { data: allEntries } = await supabase
        .from('projection_entries').select('*').eq('user_id', userId)
      const projEntries = ((allEntries ?? []) as ProjectionEntry[])

      // Prorated projection for current cycle
      const today = new Date()
      const currentCycle = getCycle(user.cycle_start ?? 1, 0)
      const diasPassados = Math.max(1,
        Math.floor((today.getTime() - currentCycle.start.getTime()) / (1000 * 60 * 60 * 24))
      )

      const built: MonthRow[] = []

      for (let offset = -3; offset <= 9; offset++) {
        const cycle = getCycle(user.cycle_start ?? 1, offset)
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
          // Orçado dos potes + parcelas de crédito futuras já lançadas (billing_date)
          expense = totalBudgeted + expenseActual
        } else if (isCurrent) {
          income = base + incomeActual
          // Projetar gasto do mês atual com base no ritmo atual
          const gastoProjetado = (expenseActual / diasPassados) * 30
          expense = Math.min(gastoProjetado, totalBudgeted)
        } else {
          // Mês passado: dados reais
          income = base + incomeActual
          expense = expenseActual
        }

        // Projection entries para este ciclo
        const monthEntries = projEntries.filter(e => e.cycle_start_date === cycle.startISO)
        income += monthEntries.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0)
        expense += monthEntries.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0)

        built.push({
          label: isFuture ? cycle.monthYear + ' *' : cycle.monthYear,
          income,
          expense,
          saldo: income - expense,
          offset,
          cycleStartISO: cycle.startISO,
          entries: monthEntries,
        })
      }

      setRows(built)

      // avgExpense dos últimos 3 meses reais
      const last3 = built.filter(m => m.offset < 0 && m.offset >= -3)
      setAvgExpense(
        last3.length > 0
          ? last3.reduce((s, m) => s + m.expense, 0) / last3.length
          : totalBudgeted
      )
    } finally {
      setLoading(false)
    }
  }

  async function deleteEntry(entryId: string) {
    Alert.alert(
      'Excluir lançamento',
      'Deseja excluir este lançamento da projeção?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('projection_entries').delete().eq('id', entryId)
            setSelectedMonthRow(null)
            loadProjectionData()
          },
        },
      ]
    )
  }

  // Entries do mês selecionado — lidos do rows atualizado para refletir cargas recentes
  const selectedEntries = selectedMonthRow
    ? (rows.find(r => r.cycleStartISO === selectedMonthRow.cycleStartISO)?.entries ?? selectedMonthRow.entries)
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
                <Text style={styles.statHint}>Baseado nos últimos 3 meses</Text>
              </View>
            </View>

            {/* Table */}
            <View style={styles.table}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  {/* Header */}
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHCell, { width: COL.month }]}>Mês</Text>
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
                    return (
                      <View key={i} style={[styles.tableRow, isFuture && styles.futureRow]}>
                        <Text style={[styles.tableCell, { width: COL.month }, isFuture && styles.futureCellText]}>
                          {row.label}
                        </Text>
                        <Text style={[styles.tableCell, { width: COL.value, textAlign: 'right', color: Colors.success }]}>
                          {brl(row.income)}
                        </Text>
                        <Text style={[styles.tableCell, { width: COL.value, textAlign: 'right', color: row.expense > 0 ? Colors.danger : Colors.textMuted }]}>
                          {brl(row.expense)}
                        </Text>
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
                    )
                  })}

                  {/* Totals row */}
                  {rows.length > 0 && (() => {
                    const totalInc = rows.reduce((s, r) => s + r.income, 0)
                    const totalExp = rows.reduce((s, r) => s + r.expense, 0)
                    const totalSaldo = totalInc - totalExp
                    return (
                      <View style={styles.totalRow}>
                        <Text style={[styles.totalCell, { width: COL.month }]}>TOTAL</Text>
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

      {/* FAB menu items */}
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
        <View style={styles.entriesModal}>
          <View style={styles.handle} />
          <Text style={styles.entriesModalTitle}>
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
                <TouchableOpacity onPress={() => deleteEntry(entry.id)} style={{ padding: 6 }}>
                  <Text>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            onPress={() => setSelectedMonthRow(null)}
            style={{ padding: 16, alignItems: 'center' }}
          >
            <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Fechar</Text>
          </TouchableOpacity>
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
    paddingVertical: 10, paddingHorizontal: 12,
  },
  tableHCell: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  tableRow: {
    flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  futureRow: { backgroundColor: Colors.background },
  tableCell: { fontSize: 11, color: Colors.textDark },
  futureCellText: { color: Colors.textMuted, fontStyle: 'italic' },
  totalRow: {
    flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12,
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
  entriesModal: {
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
  entriesModalTitle: { fontSize: 16, fontWeight: '700', color: Colors.textDark, marginBottom: 16 },
  entryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  entryDesc: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  entryMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  entryAmount: { fontSize: 13, fontWeight: '700', marginRight: 4 },
})
