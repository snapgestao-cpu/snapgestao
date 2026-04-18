import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Colors } from '../constants/colors'
import { Transaction } from '../types'
import { getPotIcon } from '../lib/potIcons'

type Props = {
  transaction: Transaction
  potName?: string
  potColor?: string
  onPress?: () => void
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro',
  debit: 'Débito',
  credit: 'Crédito',
  pix: 'Pix',
  transfer: 'Transferência',
}

function formatDate(iso: string): string {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  if (iso === today) return 'Hoje'
  if (iso === yesterday) return 'Ontem'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function TransactionItem({ transaction, potName, potColor, onPress }: Props) {
  const isExpense = transaction.type === 'expense'
  const isIncome = transaction.type === 'income'

  const amountColor = isIncome ? Colors.success : isExpense ? Colors.danger : Colors.textMuted
  const amountPrefix = isIncome ? '+' : isExpense ? '-' : ''

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.left}>
        <Text style={styles.description} numberOfLines={1}>
          {transaction.description ?? transaction.merchant ?? 'Sem descrição'}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {formatDate(transaction.date)} · {METHOD_LABEL[transaction.payment_method] ?? transaction.payment_method}
          </Text>
          {potName && (
            <View style={[styles.potBadge, { backgroundColor: (potColor ?? Colors.primary) + '20' }]}>
              <Text style={styles.potBadgeText}>
                {getPotIcon(potName)} {potName}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.amount, { color: amountColor }]}>
        {amountPrefix}{brl(transaction.amount)}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  left: { flex: 1, marginRight: 12 },
  description: { fontSize: 15, color: Colors.textDark, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: Colors.textMuted },
  potBadge: {
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  potBadgeText: { fontSize: 11, color: Colors.textDark, fontWeight: '500' },
  amount: { fontSize: 15, fontWeight: '700' },
})
