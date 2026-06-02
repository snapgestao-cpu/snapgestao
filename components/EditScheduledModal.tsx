/**
 * Criador: Diego Manhães
 * Data: 02/06/2026
 *
 * Modal de edição de lançamento agendado pendente.
 * Permite editar todos os campos. Campos IR só para Premium.
 * Ao salvar, pergunta o escopo: apenas este mês ou este e os próximos.
 * IR sempre salvo no pai (scheduled_transactions), independente do escopo.
 */

import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  Modal, ScrollView, Alert, StyleSheet, Switch,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Colors } from '../constants/colors'
import {
  updateScheduledMonthOnly,
  updateScheduledFromMonth,
} from '../lib/scheduled-transactions'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { getCycle } from '../lib/cycle'
import { CreditCard, IRCategory } from '../types'
import { IR_CATEGORY_LABELS } from '../lib/ir'

type Props = {
  visible: boolean
  item: any | null
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
  { key: 'voucher_alimentacao', label: '🍽️ Vale Aliment.' },
  { key: 'voucher_refeicao', label: '🍴 Vale Refeição' },
]

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function EditScheduledModal({
  visible, item, cycleStart, cycleOffset, onClose, onSuccess,
}: Props) {
  const user = useAuthStore(s => s.user)
  const isPremium = user?.plan === 'premium'
  const { start, end } = getCycle(cycleStart, cycleOffset)

  const [description, setDescription] = useState('')
  const [amountCents, setAmountCents] = useState(0)
  const [merchant, setMerchant] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('debit')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [cards, setCards] = useState<CreditCard[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [saving, setSaving] = useState(false)

  // IR state
  const [isIrDeductible, setIsIrDeductible] = useState(false)
  const [irCategory, setIrCategory] = useState<IRCategory>('saude')
  const [irProviderName, setIrProviderName] = useState('')
  const [irProviderDocument, setIrProviderDocument] = useState('')
  const [irReceiptNumber, setIrReceiptNumber] = useState('')

  // Re-init when item changes
  useEffect(() => {
    if (!item) return
    const s = item.scheduled_transactions
    setDescription(item.description ?? s?.description ?? '')
    const amt = item.amount != null ? item.amount : (s?.amount ?? 0)
    setAmountCents(Math.round(amt * 100))
    setMerchant(item.merchant ?? s?.merchant ?? '')
    const pm = item.payment_method ?? s?.payment_method ?? 'debit'
    setPaymentMethod(pm)
    setSelectedCardId(item.credit_card_id ?? s?.credit_card_id ?? null)
    const ds = item.date ?? item.vencimento ?? new Date().toISOString().split('T')[0]
    setSelectedDate(new Date(ds + 'T12:00:00'))
    // IR — sempre do pai
    setIsIrDeductible(s?.is_ir_deductible ?? false)
    setIrCategory(s?.ir_category ?? 'saude')
    setIrProviderName(s?.ir_provider_name ?? '')
    setIrProviderDocument(s?.ir_provider_document ?? '')
    setIrReceiptNumber(s?.ir_receipt_number ?? '')
  }, [item?.id])

  useEffect(() => {
    if (paymentMethod !== 'credit') return
    const userId = user?.id
    if (!userId) return
    supabase.from('credit_cards').select('*').eq('user_id', userId)
      .then(({ data }) => {
        const list = (data as CreditCard[]) ?? []
        setCards(list)
        if (list.length > 0 && !selectedCardId) setSelectedCardId(list[0].id)
      })
  }, [paymentMethod])

  function handleSave() {
    if (!description.trim()) {
      Alert.alert('Atenção', 'Informe a descrição.')
      return
    }
    if (amountCents <= 0) {
      Alert.alert('Atenção', 'Informe o valor.')
      return
    }

    Alert.alert(
      'Aplicar alterações em:',
      '',
      [
        { text: 'Apenas este mês', onPress: () => saveScope('month') },
        { text: 'Este e os próximos meses', onPress: () => saveScope('forward') },
        { text: 'Cancelar', style: 'cancel' },
      ]
    )
  }

  async function saveScope(scope: 'month' | 'forward') {
    if (!item) return
    setSaving(true)
    try {
      const dateStr = selectedDate.toISOString().split('T')[0]
      const effectiveCardId = paymentMethod === 'credit' ? (selectedCardId ?? null) : null

      if (scope === 'month') {
        await updateScheduledMonthOnly(item.id, item.scheduled_transaction_id, {
          description: description.trim(),
          amount: amountCents / 100,
          payment_method: paymentMethod,
          credit_card_id: effectiveCardId,
          merchant: merchant.trim() || null,
          date: dateStr,
          // IR sempre vai ao pai
          is_ir_deductible: isIrDeductible,
          ir_category: isIrDeductible ? irCategory : null,
          ir_provider_name: isIrDeductible ? (irProviderName.trim() || null) : null,
          ir_provider_document: isIrDeductible ? (irProviderDocument.trim() || null) : null,
          ir_receipt_number: isIrDeductible ? (irReceiptNumber.trim() || null) : null,
        })
      } else {
        await updateScheduledFromMonth(
          item.scheduled_transaction_id,
          item.reference_month,
          {
            description: description.trim(),
            amount: amountCents / 100,
            payment_method: paymentMethod,
            credit_card_id: effectiveCardId,
            merchant: merchant.trim() || null,
            is_ir_deductible: isIrDeductible,
            ir_category: isIrDeductible ? irCategory : null,
            ir_provider_name: isIrDeductible ? (irProviderName.trim() || null) : null,
            ir_provider_document: isIrDeductible ? (irProviderDocument.trim() || null) : null,
            ir_receipt_number: isIrDeductible ? (irReceiptNumber.trim() || null) : null,
          }
        )
      }
      onSuccess()
    } catch (err: any) {
      Alert.alert('Erro', err?.message ?? 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  const selectedCard = cards.find(c => c.id === selectedCardId)

  if (!item) return null

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>✏️ Editar Agendamento</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
          <Text style={styles.label}>Descrição *</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Descrição"
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

          {paymentMethod === 'credit' && (
            <View style={{ marginBottom: 16 }}>
              {cards.length > 0 ? (
                <>
                  <Text style={styles.label}>Cartão</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {cards.map(card => {
                      const active = selectedCardId === card.id
                      return (
                        <TouchableOpacity
                          key={card.id}
                          onPress={() => setSelectedCardId(card.id)}
                          style={[styles.chip, active && styles.chipActive]}
                        >
                          <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                            💳 {card.name}
                            {card.last_four ? ` ····${card.last_four}` : ''}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                  {selectedCard && (
                    <View style={styles.cardInfoBox}>
                      <Text style={styles.cardInfoText}>
                        ℹ️ O valor será lançado conforme o ciclo do cartão selecionado
                        {'\n'}(fecha dia {selectedCard.closing_day}, vence dia {selectedCard.due_day})
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.cardInfoBox}>
                  <Text style={styles.cardInfoText}>
                    ℹ️ Nenhum cartão cadastrado. Adicione um cartão no perfil.
                  </Text>
                </View>
              )}
            </View>
          )}

          {isPremium && (
            <View style={styles.irCard}>
              <View style={styles.irToggleRow}>
                <View>
                  <Text style={styles.irToggleLabel}>Dedutível no IR</Text>
                  <Text style={styles.irToggleHint}>Saúde, educação, previdência…</Text>
                </View>
                <Switch
                  value={isIrDeductible}
                  onValueChange={setIsIrDeductible}
                  trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
                  thumbColor={isIrDeductible ? Colors.primary : Colors.textMuted}
                />
              </View>
              {isIrDeductible && (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>Categoria IR</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {(Object.entries(IR_CATEGORY_LABELS) as [IRCategory, string][]).map(([key, label]) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setIrCategory(key)}
                        style={[styles.chip, irCategory === key && styles.chipActive]}
                      >
                        <Text style={[styles.chipLabel, irCategory === key && styles.chipLabelActive]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.label}>Prestador <Text style={{ fontWeight: '400', color: Colors.textMuted }}>(opcional)</Text></Text>
                  <TextInput
                    value={irProviderName}
                    onChangeText={setIrProviderName}
                    placeholder="Ex: Hospital, escola…"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                  />
                  <Text style={styles.label}>CPF/CNPJ do prestador <Text style={{ fontWeight: '400', color: Colors.textMuted }}>(opcional)</Text></Text>
                  <TextInput
                    value={irProviderDocument}
                    onChangeText={setIrProviderDocument}
                    placeholder="000.000.000-00"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                    style={styles.input}
                  />
                  <Text style={styles.label}>Número do recibo <Text style={{ fontWeight: '400', color: Colors.textMuted }}>(opcional)</Text></Text>
                  <TextInput
                    value={irReceiptNumber}
                    onChangeText={setIrReceiptNumber}
                    placeholder="Ex: 2024-001"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                  />
                </>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.footerPrimary, saving && { opacity: 0.7 }]}
          >
            <Text style={{ fontSize: 18 }}>💾</Text>
            <Text style={styles.footerPrimaryText}>
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.footerSecondary}>
            <Text style={styles.footerSecondaryText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
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
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  body: { padding: 20 },
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
  dateBtnText: { fontSize: 15, color: Colors.textDark },
  dateBtnAlt: { fontSize: 12, color: Colors.textMuted },
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
  cardInfoBox: {
    backgroundColor: Colors.lightBlue,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  cardInfoText: {
    fontSize: 12,
    color: Colors.primary,
    lineHeight: 18,
  },
  irCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  irToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  irToggleLabel: { fontSize: 14, fontWeight: '700', color: Colors.textDark },
  irToggleHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: Colors.white,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    gap: 10,
  },
  footerPrimary: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  footerPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footerSecondary: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footerSecondaryText: { color: Colors.textMuted, fontSize: 15 },
})
