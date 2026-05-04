import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'

type Props = {
  item: any
  onConfirm: () => void
  onCancel: () => void
}

const PAYMENT_LABELS: Record<string, string> = {
  credit: 'Crédito',
  debit: 'Débito',
  pix: 'Pix',
  cash: 'Dinheiro',
  transfer: 'Transferência',
  voucher_alimentacao: 'Vale Alimentação',
  voucher_refeicao: 'Vale Refeição',
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ScheduledItem({ item, onConfirm, onCancel }: Props) {
  const scheduled = item.scheduled_transactions
  const potColor = scheduled?.pots?.color || Colors.primary

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconBubble}>
          <Text style={{ fontSize: 14 }}>📋</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.description}>{scheduled?.description}</Text>
          {scheduled?.merchant ? (
            <Text style={styles.merchant}>🏪 {scheduled.merchant}</Text>
          ) : null}
        </View>

        <Text style={styles.amount}>-{brl(Number(scheduled?.amount || 0))}</Text>
      </View>

      <View style={styles.meta}>
        <View style={[styles.potDot, { backgroundColor: potColor }]} />
        <Text style={styles.metaText}>{scheduled?.pots?.name}</Text>
        <Text style={styles.metaText}>
          · {PAYMENT_LABELS[scheduled?.payment_method] || scheduled?.payment_method}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>A CONFIRMAR</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={onConfirm} style={styles.confirmBtn}>
          <Text style={{ fontSize: 14 }}>✅</Text>
          <Text style={styles.confirmLabel}>Confirmar</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={{ fontSize: 14 }}>🗑️</Text>
          <Text style={styles.cancelLabel}>Excluir</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  description: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  merchant: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.danger,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  potDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metaText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  badge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    color: '#92400E',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: Colors.success,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  confirmLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.danger,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  cancelLabel: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
})
