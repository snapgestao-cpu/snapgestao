import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Colors } from '../constants/colors'
import { Transaction } from '../types'

type Props = {
  transaction: Transaction
  onPress?: () => void
}

const METHOD_LABEL: Record<Transaction['payment_method'], string> = {
  cash: 'Dinheiro',
  debit: 'Débito',
  credit: 'Crédito',
  pix: 'Pix',
  transfer: 'Transferência',
}

export function TransactionItem({ transaction, onPress }: Props) {
  const isExpense = transaction.type === 'expense'
  const isIncome = transaction.type === 'income'

  const amountColor = isIncome ? Colors.success : isExpense ? Colors.danger : Colors.textMuted
  const amountPrefix = isIncome ? '+' : isExpense ? '-' : ''

  const formattedDate = new Date(transaction.date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.left}>
        <Text style={styles.description} numberOfLines={1}>
          {transaction.description ?? transaction.merchant ?? 'Sem descrição'}
        </Text>
        <Text style={styles.meta}>
          {formattedDate} · {METHOD_LABEL[transaction.payment_method]}
        </Text>
      </View>
      <Text style={[styles.amount, { color: amountColor }]}>
        {amountPrefix}R$ {transaction.amount.toFixed(2)}
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
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700' },
})
