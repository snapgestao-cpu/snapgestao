import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { PotCard } from '../../components/PotCard'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { Pot } from '../../types'

type PotRow = {
  pot: Pot
  spent: number
  remaining: number
}

function getCycleDates(cycleDay: number): { start: string; end: string } {
  const now = new Date()
  const d = now.getDate()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = d >= cycleDay ? new Date(y, m, cycleDay) : new Date(y, m - 1, cycleDay)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, cycleDay - 1)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function DashboardScreen() {
  const { user } = useAuthStore()

  const [totalIncome, setTotalIncome] = useState(0)
  const [potsData, setPotsData] = useState<PotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadDashboard = useCallback(async () => {
    if (!user) return
    try {
      // Receita mensal esperada — soma de income_sources, não de transactions
      const { data: incomeSources, error: incomeErr } = await supabase
        .from('income_sources')
        .select('amount, name, is_primary')
        .eq('user_id', user.id)
      if (incomeErr) console.error('Erro ao buscar receitas:', incomeErr)

      const totalReceita = (incomeSources ?? []).reduce((sum, s) => sum + Number(s.amount), 0)
      setTotalIncome(totalReceita)

      // Pots do usuário
      const { data: pots, error: potsErr } = await supabase
        .from('pots')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (potsErr) console.error('Erro ao buscar potes:', potsErr)

      if (!pots || pots.length === 0) {
        setPotsData([])
        return
      }

      // Datas do ciclo atual
      const { start: cycleStart, end: cycleEnd } = getCycleDates(user.cycle_start ?? 1)

      // Gasto por pote no ciclo atual
      const rows: PotRow[] = await Promise.all(
        pots.map(async (pot) => {
          const { data: txs } = await supabase
            .from('transactions')
            .select('amount')
            .eq('pot_id', pot.id)
            .eq('type', 'expense')
            .gte('date', cycleStart)
            .lte('date', cycleEnd)

          const spent = (txs ?? []).reduce((sum, t) => sum + Number(t.amount), 0)
          const remaining = (pot.limit_amount ?? 0) - spent
          return { pot: pot as Pot, spent, remaining }
        })
      )

      setPotsData(rows)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    setLoading(true)
    loadDashboard()
  }, [loadDashboard])

  const onRefresh = () => {
    setRefreshing(true)
    loadDashboard()
  }

  const totalExpense = potsData.reduce((sum, r) => sum + r.spent, 0)

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <Text style={styles.greeting}>Olá, {user?.name ?? 'usuário'} 👋</Text>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: Colors.lightGreen }]}>
            <Text style={styles.summaryLabel}>Receitas</Text>
            <Text style={[styles.summaryValue, { color: Colors.success }]}>
              {brl(totalIncome)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: Colors.lightRed }]}>
            <Text style={styles.summaryLabel}>Despesas</Text>
            <Text style={[styles.summaryValue, { color: Colors.danger }]}>
              {brl(totalExpense)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Meus potes</Text>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        ) : potsData.length === 0 ? (
          <Text style={styles.empty}>Nenhum pote criado ainda.</Text>
        ) : (
          potsData.map(({ pot, spent, remaining }) => (
            <PotCard
              key={pot.id}
              name={pot.name}
              color={pot.color}
              limit_amount={pot.limit_amount}
              spent={spent}
              remaining={remaining}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20 },
  greeting: { fontSize: 22, fontWeight: '700', color: Colors.textDark, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 14 },
  summaryLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.textDark, marginBottom: 12 },
  loader: { marginTop: 32 },
  empty: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 20 },
})
