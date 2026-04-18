import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Colors } from '../constants/colors'
import { getPotIcon } from '../lib/potIcons'

type Props = {
  name: string
  color: string
  limit_amount?: number | null
  spent: number
  remaining: number
  onPress?: () => void
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PotCard({ name, color, limit_amount, spent, remaining, onPress }: Props) {
  const limit = limit_amount ?? 0
  const progress = limit > 0 ? Math.min(spent / limit, 1) : 0
  const pct = progress * 100
  const isOverBudget = limit > 0 && spent > limit

  const progressColor = isOverBudget || pct >= 80
    ? Colors.danger
    : pct >= 50
      ? Colors.warning
      : color

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: color }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: color + '26' }]}>
          <Text style={styles.icon}>{getPotIcon(name)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{name}</Text>
          {limit > 0 && (
            <Text style={[styles.remaining, isOverBudget && styles.overBudget]}>
              {isOverBudget
                ? `${brl(Math.abs(remaining))} acima`
                : `${brl(remaining)} restantes`}
            </Text>
          )}
        </View>
        <View style={styles.spentCol}>
          <Text style={styles.spent}>{brl(spent)}</Text>
          {limit > 0 && <Text style={styles.spentLabel}>gasto</Text>}
        </View>
      </View>

      {limit > 0 && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${pct}%`, backgroundColor: progressColor },
            ]}
          />
        </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: { fontSize: 24 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.textDark },
  remaining: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  overBudget: { color: Colors.danger },
  spentCol: { alignItems: 'flex-end' },
  spent: { fontSize: 16, fontWeight: '700', color: Colors.textDark },
  spentLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
})
