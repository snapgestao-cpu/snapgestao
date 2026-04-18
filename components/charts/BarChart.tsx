import React from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import { Colors } from '../../constants/colors'

type BarData = {
  month: string
  income: number
  expense: number
}

type Props = {
  data: BarData[]
}

const SCREEN_WIDTH = Dimensions.get('window').width
const CHART_WIDTH = SCREEN_WIDTH - 48

export function BarChart({ data }: Props) {
  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1)

  return (
    <View style={styles.container}>
      <View style={styles.chart}>
        {data.map((item) => (
          <View key={item.month} style={styles.group}>
            <View style={styles.bars}>
              <View
                style={[
                  styles.bar,
                  styles.incomeBar,
                  { height: (item.income / maxVal) * 120 },
                ]}
              />
              <View
                style={[
                  styles.bar,
                  styles.expenseBar,
                  { height: (item.expense / maxVal) * 120 },
                ]}
              />
            </View>
            <Text style={styles.label}>{item.month}</Text>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: Colors.accent }]} />
          <Text style={styles.legendText}>Receita</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: Colors.danger }]} />
          <Text style={styles.legendText}>Despesa</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { width: CHART_WIDTH },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 4,
  },
  group: { flex: 1, alignItems: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 8, borderRadius: 2 },
  incomeBar: { backgroundColor: Colors.accent },
  expenseBar: { backgroundColor: Colors.danger },
  label: { fontSize: 9, color: Colors.textMuted, marginTop: 4 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: Colors.textMuted },
})
