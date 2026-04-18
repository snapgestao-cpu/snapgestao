import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Colors } from '../constants/colors'
import { Goal } from '../types'

type Props = {
  goal: Goal
  onPress?: () => void
}

export function GoalCard({ goal, onPress }: Props) {
  const progress = goal.target_amount > 0
    ? Math.min(goal.current_amount / goal.target_amount, 1)
    : 0
  const percent = Math.round(progress * 100)

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>{goal.name}</Text>
        <Text style={styles.horizon}>{goal.horizon_years} anos</Text>
      </View>

      <View style={styles.amounts}>
        <Text style={styles.current}>R$ {goal.current_amount.toFixed(2)}</Text>
        <Text style={styles.target}>/ R$ {goal.target_amount.toFixed(2)}</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>

      <Text style={styles.percent}>{percent}% concluído</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: { fontSize: 15, fontWeight: '600', color: Colors.textDark, flex: 1 },
  horizon: {
    fontSize: 12,
    color: Colors.primary,
    backgroundColor: Colors.lightBlue,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  amounts: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  current: { fontSize: 18, fontWeight: '700', color: Colors.textDark },
  target: { fontSize: 13, color: Colors.textMuted, marginLeft: 4 },
  progressTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 4,
  },
  percent: { fontSize: 12, color: Colors.textMuted },
})
