/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Item de lançamento agendado pendente — exibe descrição, valor e
 * botões de confirmar/cancelar para o mês corrente do pote.
 */

import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'
import { brl } from '../lib/finance'
import { PAYMENT_LABEL } from '../lib/payment-methods'
import { IR_CATEGORY_LABELS } from '../lib/ir'

type Props = {
  item: any
  vencimento?: string | null
  onConfirm: () => void
  onCancel: () => void
  onEdit: () => void
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}


export default function ScheduledItem({ item, vencimento, onConfirm, onCancel, onEdit }: Props) {
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
          · {PAYMENT_LABEL[scheduled?.payment_method] || scheduled?.payment_method}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>A CONFIRMAR</Text>
        </View>
      </View>

      {scheduled?.is_ir_deductible ? (
        <View style={styles.irBadge}>
          <Text style={styles.irBadgeText}>
            🎓 IR: {IR_CATEGORY_LABELS[scheduled.ir_category as keyof typeof IR_CATEGORY_LABELS] ?? scheduled.ir_category}
            {scheduled.ir_provider_name ? ` · ${scheduled.ir_provider_name}` : ''}
          </Text>
        </View>
      ) : null}

      {vencimento ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <Text style={{ fontSize: 11 }}>📅</Text>
          <Text style={{ fontSize: 11, color: '#92400E', fontWeight: '600' }}>
            Vencimento: {formatDate(vencimento)}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity onPress={onConfirm} style={styles.confirmBtn}>
          <Text style={{ fontSize: 14 }}>✅</Text>
          <Text style={styles.confirmLabel}>Confirmar</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onEdit} style={styles.editBtn}>
          <Text style={{ fontSize: 14 }}>✏️</Text>
          <Text style={styles.editLabel}>Editar</Text>
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
  irBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  irBadgeText: {
    fontSize: 11,
    color: '#4338CA',
    fontWeight: '600',
  },
  editBtn: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  editLabel: {
    color: Colors.primary,
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
