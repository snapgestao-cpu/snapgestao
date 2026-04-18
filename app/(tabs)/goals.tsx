import React from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Colors } from '../../constants/colors'
import { GoalCard } from '../../components/GoalCard'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import { Goal } from '../../types'

export default function GoalsScreen() {
  const { user } = useAuthStore()

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ['goals', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('target_date', { ascending: true })
      if (error) throw error
      return data as Goal[]
    },
    enabled: !!user,
  })

  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0)
  const totalCurrent = goals.reduce((s, g) => s + g.current_amount, 0)

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Metas</Text>

        {goals.length > 0 && (
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Total acumulado</Text>
            <Text style={styles.summaryValue}>
              R$ {totalCurrent.toFixed(2)}{' '}
              <Text style={styles.summaryMuted}>/ R$ {totalTarget.toFixed(2)}</Text>
            </Text>
          </View>
        )}

        {isLoading ? (
          <Text style={styles.empty}>Carregando...</Text>
        ) : goals.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyTitle}>Nenhuma meta ainda</Text>
            <Text style={styles.empty}>Crie uma meta de longo prazo para começar.</Text>
          </View>
        ) : (
          <FlatList
            data={goals}
            keyExtractor={(g) => g.id}
            renderItem={({ item }) => <GoalCard goal={item} />}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textDark, marginBottom: 20 },
  summary: {
    backgroundColor: Colors.lightBlue,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  summaryMuted: { fontSize: 14, fontWeight: '400', color: Colors.textMuted },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.textDark, marginBottom: 8 },
  empty: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
})
