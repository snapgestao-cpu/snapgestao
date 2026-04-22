import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native'
import { Colors } from '../constants/colors'
import { Goal } from '../types'
import { calcFV, brl } from '../lib/finance'
import { getGoalIcon } from '../lib/goalIcons'

function getPotImage(percent: number) {
  if (percent <= 0) return require('../assets/potes/Pote_vazio.png')
  if (percent < 20) return require('../assets/potes/Pote_10.png')
  if (percent < 40) return require('../assets/potes/Pote_30.png')
  if (percent < 60) return require('../assets/potes/Pote_50.png')
  if (percent < 80) return require('../assets/potes/Pote_70.png')
  if (percent < 100) return require('../assets/potes/Pote_90.png')
  return require('../assets/potes/Pote_100.png')
}

function horizonMeta(years: number): { color: string } {
  if (years <= 5) return { color: Colors.success }
  if (years <= 10) return { color: Colors.warning }
  return { color: '#534AB7' }
}

function horizonLabel(years: number): string {
  const totalMonths = Math.round(years * 12)
  const y = Math.floor(totalMonths / 12)
  const m = totalMonths % 12
  if (m === 0) return `${y} ano${y !== 1 ? 's' : ''}`
  if (y === 0) return `${m} mês${m !== 1 ? 'es' : ''}`
  return `${y}a ${m}m`
}

type Props = {
  goal: Goal
  onDeposit?: () => void
  onLongPress?: () => void
}

export function GoalCard({ goal, onDeposit, onLongPress }: Props) {
  const progress = goal.target_amount > 0
    ? Math.min(goal.current_amount / goal.target_amount, 1)
    : 0
  const percent = Math.round(progress * 100)

  const meta = horizonMeta(goal.horizon_years)
  const icon = getGoalIcon(goal.name)

  const projectedFV = goal.monthly_deposit && goal.interest_rate
    ? calcFV(goal.monthly_deposit, goal.interest_rate, goal.horizon_years)
    : null

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: meta.color }]}
      onLongPress={onLongPress}
      activeOpacity={0.85}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={styles.name}>{goal.name}</Text>
          <View style={[styles.horizonBadge, { backgroundColor: meta.color + '22' }]}>
            <Text style={[styles.horizonText, { color: meta.color }]}>{horizonLabel(goal.horizon_years)}</Text>
          </View>
        </View>
        <Image source={getPotImage(percent)} style={{ width: 56, height: 68, resizeMode: 'contain', marginLeft: 8 }} />
      </View>

      {/* Amounts */}
      <View style={styles.amountRow}>
        <Text style={styles.current}>{brl(goal.current_amount)}</Text>
        <Text style={styles.target}> de {brl(goal.target_amount)}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${percent}%`, backgroundColor: meta.color }]}
        />
      </View>
      <Text style={styles.percent}>{percent}% concluído</Text>

      {/* Monthly deposit + projection */}
      {(goal.monthly_deposit || projectedFV) ? (
        <View style={styles.simRow}>
          {goal.monthly_deposit ? (
            <Text style={styles.simText}>
              Aporte: <Text style={styles.simValue}>{brl(goal.monthly_deposit)}/mês</Text>
            </Text>
          ) : null}
          {projectedFV ? (
            <Text style={styles.simText}>
              Projeção: <Text style={[styles.simValue, { color: meta.color }]}>{brl(projectedFV)}</Text>
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Deposit button */}
      {onDeposit && (
        <TouchableOpacity
          style={[styles.depositBtn, { borderColor: meta.color }]}
          onPress={onDeposit}
          activeOpacity={0.7}
        >
          <Text style={[styles.depositBtnText, { color: meta.color }]}>+ Transferir valor</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderLeftWidth: 3,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  icon: { fontSize: 22 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  horizonBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  horizonText: { fontSize: 11, fontWeight: '700' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  current: { fontSize: 20, fontWeight: '800', color: Colors.textDark },
  target: { fontSize: 13, color: Colors.textMuted },
  progressTrack: {
    height: 8, backgroundColor: Colors.border,
    borderRadius: 4, overflow: 'hidden', marginBottom: 4,
  },
  progressFill: { height: '100%', borderRadius: 4 },
  percent: { fontSize: 11, color: Colors.textMuted, marginBottom: 10 },
  simRow: { gap: 4, marginBottom: 10 },
  simText: { fontSize: 12, color: Colors.textMuted },
  simValue: { fontWeight: '700', color: Colors.textDark },
  depositBtn: {
    borderWidth: 1.5, borderRadius: 10,
    paddingVertical: 9, alignItems: 'center',
  },
  depositBtnText: { fontSize: 13, fontWeight: '700' },
})
