import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  Modal, ScrollView, Alert, StyleSheet,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Colors } from '../constants/colors'
import { createScheduledTransaction } from '../lib/scheduled-transactions'
import { useAuthStore } from '../stores/useAuthStore'
import { getCycle } from '../lib/cycle'

type Props = {
  visible: boolean
  potId: string
  potName: string
  cycleStart: number
  cycleOffset: number
  onClose: () => void
  onSuccess: () => void
}

const PAYMENT_METHODS = [
  { key: 'debit', label: '💳 Débito' },
  { key: 'credit', label: '💳 Crédito' },
  { key: 'pix', label: '📱 Pix' },
  { key: 'cash', label: '💵 Dinheiro' },
  { key: 'transfer', label: '🔄 Transferência' },
  { key: 'voucher_alimentacao', label: '🍽️ Vale Alimentação' },
  { key: 'voucher_refeicao', label: '🍴 Vale Refeição' },
]

const MONTH_OPTIONS = [1, 2, 3, 6, 12, 24]

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function NewScheduledModal({
  visible, potId, potName, cycleStart, cycleOffset, onClose, onSuccess,
}: Props) {
  const user = useAuthStore(s => s.user)
  const [description, setDescription] = useState('')
  const [amountCents, setAmountCents] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('debit')
  const [merchant, setMerchant] = useState('')
  const [totalMonths, setTotalMonths] = useState(1)
  const [saving, setSaving] = useState(false)

  const { start, end } = getCycle(cycleStart, cycleOffset)
  const [selectedDate, setSelectedDate] = useState<Date>(
    cycleOffset === 0 ? new Date() : start
  )
  const [showDatePicker, setShowDatePicker] = useState(false)

  function reset() {
    setDescription('')
    setAmountCents(0)
    setPaymentMethod('debit')
    setMerchant('')
    setTotalMonths(1)
    setSelectedDate(cycleOffset === 0 ? new Date() : start)
  }

  async function handleSave() {
    if (!description.trim()) {
      Alert.alert('Atenção', 'Informe a descrição.')
      return
    }
    if (amountCents <= 0) {
      Alert.alert('Atenção', 'Informe o valor.')
      return
    }

    setSaving(true)
    try {
      await createScheduledTransaction(user!.id, potId, {
        description: description.trim(),
        amount: amountCents / 100,
        payment_method: paymentMethod,
        merchant: merchant.trim() || undefined,
        start_date: selectedDate.toISOString().split('T')[0],
        total_months: totalMonths,
      })
      reset()
      onSuccess()
    } catch (err) {
      Alert.alert('Erro', String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.headerAction}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>📋 Lançamento a Confirmar</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[styles.headerAction, styles.headerSave, saving && { opacity: 0.5 }]}>
              Salvar
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.potChip}>
            <Text style={{ fontSize: 16 }}>🫙</Text>
            <Text style={styles.potChipText}>Pote: {potName}</Text>
          </View>

          <Text style={styles.label}>Descrição *</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Ex: Conta de Luz"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Estabelecimento (opcional)</Text>
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder="Ex: CEMIG, Copasa..."
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Data do lançamento</Text>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={styles.dateBtn}
          >
            <Text style={styles.dateBtnText}>
              📅 {selectedDate.toLocaleDateString('pt-BR')}
            </Text>
            <Text style={styles.dateBtnAlt}>Alterar</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              minimumDate={start}
              maximumDate={end}
              onChange={(_, date) => {
                setShowDatePicker(false)
                if (date) setSelectedDate(date)
              }}
            />
          )}

          <Text style={styles.label}>Valor *</Text>
          <TextInput
            value={amountCents === 0 ? '' : formatCents(amountCents)}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '')
              setAmountCents(parseInt(digits || '0', 10))
            }}
            placeholder="R$ 0,00"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            style={[styles.input, styles.inputAmount]}
          />

          <Text style={styles.label}>Forma de pagamento</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {PAYMENT_METHODS.map(pm => {
              const active = paymentMethod === pm.key
              return (
                <TouchableOpacity
                  key={pm.key}
                  onPress={() => setPaymentMethod(pm.key)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <Text style={styles.label}>Por quantos meses?</Text>
          <View style={styles.monthsRow}>
            {MONTH_OPTIONS.map(m => {
              const active = totalMonths === m
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setTotalMonths(m)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                    {m === 1 ? '1 mês' : `${m} meses`}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>📋 Resumo</Text>
            <Text style={styles.summaryText}>
              {description || 'Sem descrição'} · {formatCents(amountCents)} ·{' '}
              {totalMonths === 1 ? 'Apenas este mês' : `${totalMonths} meses`}
            </Text>
            <Text style={styles.summaryDate}>
              Data: {selectedDate.toLocaleDateString('pt-BR')}
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    backgroundColor: Colors.primary,
    padding: 20,
    paddingTop: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAction: { color: '#fff', fontSize: 16 },
  headerSave: { fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  body: { padding: 20 },
  potChip: {
    backgroundColor: Colors.lightBlue,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  potChipText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.textDark,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  inputAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.danger,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.lightBlue,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: Colors.textDark,
  },
  chipLabelActive: {
    fontWeight: '700',
    color: Colors.primary,
  },
  monthsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  summary: {
    backgroundColor: Colors.lightBlue,
    borderRadius: 12,
    padding: 14,
  },
  summaryTitle: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  summaryDate: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  dateBtn: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateBtnText: {
    fontSize: 15,
    color: Colors.textDark,
  },
  dateBtnAlt: {
    fontSize: 12,
    color: Colors.textMuted,
  },
})
