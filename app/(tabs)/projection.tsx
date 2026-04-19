import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'

const COL = { month: 72, value: 108 }
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { getCycle } from '../../lib/cycle'

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type MonthRow = {
  label: string
  income: number
  expense: number
  saldo: number
}

export default function ProjectionScreen() {
  const { user } = useAuthStore()
  const [rows, setRows] = useState<MonthRow[]>([])
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadProjection()
  }, [user?.id])

  async function loadProjection() {
    if (!user) return
    setLoading(true)
    try {
      const { data: sources } = await supabase
        .from('income_sources').select('amount').eq('user_id', user.id)
      const base = ((sources ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)
      setMonthlyIncome(base)

      const built: MonthRow[] = []
      for (let offset = -5; offset <= 0; offset++) {
        const cycle = getCycle(user.cycle_start ?? 1, offset)
        const { data: txs } = await supabase
          .from('transactions')
          .select('type,amount,payment_method,billing_date,date')
          .eq('user_id', user.id)
          .or(
            `and(payment_method.eq.credit,billing_date.gte.${cycle.startISO},billing_date.lte.${cycle.endISO}),` +
            `and(payment_method.neq.credit,date.gte.${cycle.startISO},date.lte.${cycle.endISO})`
          )
        const incomeActual = ((txs ?? []) as any[])
          .filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
        const expense = ((txs ?? []) as any[])
          .filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
        const income = base + incomeActual
        built.push({
          label: cycle.monthYear,
          income,
          expense,
          saldo: income - expense,
        })
      }

      for (let offset = 1; offset <= 6; offset++) {
        const cycle = getCycle(user.cycle_start ?? 1, offset)
        built.push({
          label: cycle.monthYear + ' *',
          income: base,
          expense: 0,
          saldo: base,
        })
      }

      setRows(built)
    } finally {
      setLoading(false)
    }
  }

  const pastRows = rows.filter(r => !r.label.endsWith('*'))
  const avgExpense = pastRows.length
    ? pastRows.reduce((s, r) => s + r.expense, 0) / pastRows.length
    : 0

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Projeção</Text>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.summaryRow}>
              <View style={[styles.stat, { backgroundColor: Colors.lightGreen }]}>
                <Text style={styles.statLabel}>Receita mensal base</Text>
                <Text style={[styles.statValue, { color: Colors.success }]}>{brl(monthlyIncome)}</Text>
              </View>
              <View style={[styles.stat, { backgroundColor: Colors.lightRed }]}>
                <Text style={styles.statLabel}>Gasto médio</Text>
                <Text style={[styles.statValue, { color: Colors.danger }]}>{brl(avgExpense)}</Text>
              </View>
            </View>

            <View style={styles.table}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  {/* Header */}
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHCell, { width: COL.month }]}>Ciclo</Text>
                    <Text style={[styles.tableHCell, { width: COL.value, textAlign: 'right', color: Colors.success }]}>Receita</Text>
                    <Text style={[styles.tableHCell, { width: COL.value, textAlign: 'right', color: Colors.danger }]}>Gasto</Text>
                    <Text style={[styles.tableHCell, { width: COL.value, textAlign: 'right', paddingRight: 12 }]}>Saldo</Text>
                  </View>

                  {rows.map((row, i) => {
                    const isFuture = row.label.endsWith('*')
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
                        <Text style={[styles.tableCell, { width: COL.value, textAlign: 'right', paddingRight: 12, color: row.saldo >= 0 ? Colors.success : Colors.danger }]}>
                          {brl(row.saldo)}
                        </Text>
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

            <Text style={styles.hint}>* Meses futuros usam receita base sem gastos lançados.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textDark, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  stat: { flex: 1, borderRadius: 12, padding: 14 },
  statLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '700' },
  table: {
    backgroundColor: Colors.white, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: Colors.lightBlue,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  tableHCell: { flex: 1, fontSize: 11, fontWeight: '700', color: Colors.primary },
  tableRow: {
    flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  futureRow: { backgroundColor: Colors.background },
  tableCell: { flex: 1, fontSize: 11, color: Colors.textDark },
  futureCellText: { color: Colors.textMuted, fontStyle: 'italic' },
  totalRow: {
    flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: Colors.lightBlue,
    borderTopWidth: 1.5, borderTopColor: Colors.border,
  },
  totalCell: { flex: 1, fontSize: 11, fontWeight: '700', color: Colors.textDark },
  hint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
})
