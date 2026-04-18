import React, { useMemo } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { BarChart } from '../../components/charts/BarChart'
import { useTransactions } from '../../hooks/useTransactions'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function ProjectionScreen() {
  const { data: transactions = [] } = useTransactions()

  const chartData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const month = MONTH_NAMES[date.getMonth()]
      const year = date.getFullYear()
      const monthTxs = transactions.filter((t) => {
        const d = new Date(t.date)
        return d.getFullYear() === year && d.getMonth() === date.getMonth()
      })
      const income = monthTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const expense = monthTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      return { month, income, expense }
    })
  }, [transactions])

  const avgIncome = chartData.reduce((s, d) => s + d.income, 0) / 12
  const avgExpense = chartData.reduce((s, d) => s + d.expense, 0) / 12

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Projeção 12 meses</Text>

        <View style={styles.card}>
          <BarChart data={chartData} />
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.stat, { backgroundColor: Colors.lightGreen }]}>
            <Text style={styles.statLabel}>Receita média</Text>
            <Text style={[styles.statValue, { color: Colors.success }]}>
              R$ {avgIncome.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.stat, { backgroundColor: Colors.lightRed }]}>
            <Text style={styles.statLabel}>Gasto médio</Text>
            <Text style={[styles.statValue, { color: Colors.danger }]}>
              R$ {avgExpense.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHCell}>Mês</Text>
            <Text style={styles.tableHCell}>Receita</Text>
            <Text style={styles.tableHCell}>Despesa</Text>
            <Text style={styles.tableHCell}>Saldo</Text>
          </View>
          {chartData.map((row) => (
            <View key={row.month} style={styles.tableRow}>
              <Text style={styles.tableCell}>{row.month}</Text>
              <Text style={[styles.tableCell, { color: Colors.success }]}>
                {row.income.toFixed(0)}
              </Text>
              <Text style={[styles.tableCell, { color: Colors.danger }]}>
                {row.expense.toFixed(0)}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { color: row.income - row.expense >= 0 ? Colors.success : Colors.danger },
                ]}
              >
                {(row.income - row.expense).toFixed(0)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textDark, marginBottom: 20 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  stat: { flex: 1, borderRadius: 12, padding: 14 },
  statLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '700' },
  table: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.lightBlue,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tableHCell: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.primary },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableCell: { flex: 1, fontSize: 13, color: Colors.textDark },
})
