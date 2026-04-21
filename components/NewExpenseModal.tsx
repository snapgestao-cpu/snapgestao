import React, { useState, useEffect } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'
import { Pot, CreditCard } from '../types'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'
import { getPotIcon } from '../lib/potIcons'
import { checkCriticalPots } from '../lib/notifications'
import { brl } from '../lib/finance'

type PayMethod = 'cash' | 'debit' | 'credit' | 'pix'

const PAY_METHODS: { key: PayMethod; label: string }[] = [
  { key: 'cash', label: 'Dinheiro' },
  { key: 'debit', label: 'Débito' },
  { key: 'credit', label: 'Crédito' },
  { key: 'pix', label: 'Pix' },
]

type Props = {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
  pots: Pot[]
  initialDate?: string
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}
function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function calcBillingDate(txISO: string, card: CreditCard, offset = 0): string {
  const [y, m, d] = txISO.split('-').map(Number)
  let month0 = m - 1  // 0-indexed (April=3)
  let year = y

  // Passed closing day → purchase goes into next billing cycle
  if (d >= card.closing_day) month0 += 1

  // Due day is before closing day → payment falls in month after closing
  if (card.due_day < card.closing_day) month0 += 1

  month0 += offset
  while (month0 > 11) { month0 -= 12; year += 1 }
  return new Date(year, month0, card.due_day).toISOString().split('T')[0]
}
function genUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export function NewExpenseModal({ visible, onClose, onSuccess, pots, initialDate }: Props) {
  const insets = useSafeAreaInsets()

  const [amountDigits, setAmountDigits] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPotId, setSelectedPotId] = useState<string | null>(null)
  const [dateISO, setDateISO] = useState(todayISO())
  const [dateDisplay, setDateDisplay] = useState(isoToDisplay(todayISO()))
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('pix')
  const [cards, setCards] = useState<CreditCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [merchant, setMerchant] = useState('')
  const [isNeed, setIsNeed] = useState<boolean | null>(null)
  const [isInstallment, setIsInstallment] = useState(false)
  const [installments, setInstallments] = useState(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setAmountDigits('')
    setDescription('')
    setSelectedPotId(pots[0]?.id ?? null)
    const d = initialDate ?? todayISO()
    setDateISO(d)
    setDateDisplay(isoToDisplay(d))
    setPaymentMethod('pix')
    setCards([])
    setSelectedCardId(null)
    setMerchant('')
    setIsNeed(null)
    setIsInstallment(false)
    setInstallments(2)
    setError(null)
  }, [visible])

  useEffect(() => {
    if (paymentMethod !== 'credit') { setIsInstallment(false); return }
    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return
    supabase.from('credit_cards').select('*').eq('user_id', userId)
      .then(({ data }) => {
        setCards((data as CreditCard[]) ?? [])
        setSelectedCardId((data?.[0] as CreditCard | undefined)?.id ?? null)
      })
  }, [paymentMethod])

  const handleDateInput = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8)
    let display = digits
    if (digits.length > 2) display = digits.slice(0, 2) + '/' + digits.slice(2)
    if (digits.length > 4) display = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4)
    setDateDisplay(display)
    if (digits.length === 8) {
      const d = digits.slice(0, 2), mo = digits.slice(2, 4), y = digits.slice(4)
      const parsed = new Date(`${y}-${mo}-${d}T12:00:00`)
      if (!isNaN(parsed.getTime())) setDateISO(`${y}-${mo}-${d}`)
    }
  }

  const handleSave = async () => {
    const totalAmount = centsToFloat(amountDigits)
    if (totalAmount <= 0) { setError('Informe um valor maior que zero.'); return }
    if (!selectedPotId) { setError('Selecione um pote para este gasto.'); return }

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) { setError('Sessão inválida.'); return }

    setError(null)
    setLoading(true)
    try {
      const card = cards.find(c => c.id === selectedCardId)
      const groupId = isInstallment ? genUUID() : null
      const totalParcelas = isInstallment ? installments : 1
      const installmentValue = totalAmount / totalParcelas

      const rows = Array.from({ length: totalParcelas }, (_, i) => ({
        user_id: userId,
        pot_id: selectedPotId,
        card_id: paymentMethod === 'credit' ? (selectedCardId ?? null) : null,
        type: 'expense' as const,
        amount: Math.round(installmentValue * 100) / 100,
        description: isInstallment
          ? `${description.trim() || merchant.trim() || 'Compra'} (${i + 1}/${totalParcelas})`
          : (description.trim() || null),
        merchant: merchant.trim() || null,
        date: dateISO,
        billing_date: card ? calcBillingDate(dateISO, card, i) : null,
        payment_method: paymentMethod,
        is_need: isNeed,
        installment_total: isInstallment ? totalParcelas : null,
        installment_number: isInstallment ? i + 1 : null,
        installment_group_id: groupId,
      }))

      const { error: txErr } = await supabase.from('transactions').insert(rows)
      if (txErr) { setError('Erro ao salvar: ' + txErr.message); return }

      if (merchant.trim()) {
        void supabase.from('smart_merchants').upsert({
          user_id: userId,
          name: merchant.trim().toLowerCase(),
          pot_id: selectedPotId,
        }, { onConflict: 'user_id,name' })
      }

      onSuccess()
      onClose()

      const { user } = useAuthStore.getState()
      if (user) checkCriticalPots(userId, user.cycle_start ?? 1).catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  const totalAmount = centsToFloat(amountDigits)
  const installmentValue = isInstallment && installments > 1 ? totalAmount / installments : 0

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject as any} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Novo Gasto</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Valor */}
            <TextInput
              style={styles.amountInput}
              value={formatCents(amountDigits)}
              onChangeText={t => { setAmountDigits(digitsOnly(t)); setError(null) }}
              keyboardType="numeric"
              placeholder="R$ 0,00"
              placeholderTextColor={Colors.textMuted}
              textAlign="center"
            />

            {/* Descrição */}
            <Text style={styles.label}>Descrição</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Ex: Almoço, Netflix…"
              placeholderTextColor={Colors.textMuted}
            />

            {/* Pote */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>Pote </Text>
              <Text style={styles.labelRequired}>*</Text>
            </View>
            {pots.length === 0 ? (
              <View style={styles.emptyPotsBox}>
                <Text style={styles.emptyPotsText}>
                  Nenhum pote disponível.{'\n'}Crie um pote antes de registrar um gasto.
                </Text>
                <TouchableOpacity onPress={() => { onClose(); router.push('/(tabs)/') }}>
                  <Text style={styles.emptyPotsLink}>Criar pote →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {pots.map(pot => (
                  <TouchableOpacity
                    key={pot.id}
                    style={[styles.potChip, { borderColor: pot.color }, selectedPotId === pot.id && { backgroundColor: pot.color + '20' }]}
                    onPress={() => setSelectedPotId(pot.id)}
                  >
                    <Text style={styles.potChipIcon}>{getPotIcon(pot.name)}</Text>
                    <Text style={[styles.potChipText, selectedPotId === pot.id && { color: pot.color, fontWeight: '700' }]}>
                      {pot.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Data */}
            <Text style={styles.label}>Data</Text>
            <TextInput
              style={styles.input}
              value={dateDisplay}
              onChangeText={handleDateInput}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />

            {/* Forma de pagamento */}
            <Text style={styles.label}>Forma de pagamento</Text>
            <View style={styles.chipRow}>
              {PAY_METHODS.map(m => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.chip, paymentMethod === m.key && styles.chipActive]}
                  onPress={() => setPaymentMethod(m.key)}
                >
                  <Text style={[styles.chipText, paymentMethod === m.key && styles.chipTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Cartão + Parcelamento */}
            {paymentMethod === 'credit' && (
              <>
                <Text style={styles.label}>Cartão</Text>
                {cards.length === 0 ? (
                  <Text style={styles.hint}>Nenhum cartão cadastrado.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {cards.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.chip, selectedCardId === c.id && styles.chipActive]}
                        onPress={() => setSelectedCardId(c.id)}
                      >
                        <Text style={[styles.chipText, selectedCardId === c.id && styles.chipTextActive]}>
                          {c.name} {c.last_four ? `••${c.last_four}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {/* Toggle parcelado */}
                <View style={styles.installToggleRow}>
                  <Text style={styles.installToggleLabel}>Compra parcelada?</Text>
                  <Switch
                    value={isInstallment}
                    onValueChange={setIsInstallment}
                    trackColor={{ false: Colors.border, true: Colors.primary }}
                    thumbColor="#fff"
                  />
                </View>

                {/* Número de parcelas */}
                {isInstallment && (
                  <View style={styles.installBox}>
                    <Text style={styles.installSliderLabel}>Número de parcelas</Text>
                    <View style={styles.installSliderRow}>
                      <Slider
                        style={{ flex: 1 }}
                        minimumValue={2}
                        maximumValue={24}
                        step={1}
                        value={installments}
                        onValueChange={v => setInstallments(Math.round(v))}
                        minimumTrackTintColor={Colors.primary}
                        maximumTrackTintColor={Colors.border}
                        thumbTintColor={Colors.primary}
                      />
                      <Text style={styles.installCount}>{installments}x</Text>
                    </View>

                    {totalAmount > 0 && (
                      <View style={styles.installPreview}>
                        <Text style={styles.installPreviewLabel}>Valor de cada parcela:</Text>
                        <Text style={styles.installPreviewValue}>{brl(installmentValue)}</Text>
                      </View>
                    )}

                    <Text style={styles.installHint}>
                      Serão criados {installments} lançamentos automáticos nos próximos meses
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Estabelecimento */}
            <Text style={styles.label}>Estabelecimento <Text style={styles.optional}>(opcional)</Text></Text>
            <TextInput
              style={styles.input}
              value={merchant}
              onChangeText={setMerchant}
              placeholder="Ex: Mercado Extra, iFood…"
              placeholderTextColor={Colors.textMuted}
            />

            {/* Eu precisava disso? */}
            <Text style={styles.label}>Eu precisava disso?</Text>
            <View style={styles.needRow}>
              <TouchableOpacity
                style={[styles.needBtn, isNeed === true && styles.needBtnYes]}
                onPress={() => setIsNeed(isNeed === true ? null : true)}
              >
                <Text style={[styles.needBtnText, isNeed === true && { color: Colors.success }]}>Sim ✓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.needBtn, isNeed === false && styles.needBtnNo]}
                onPress={() => setIsNeed(isNeed === false ? null : false)}
              >
                <Text style={[styles.needBtnText, isNeed === false && { color: Colors.danger }]}>Não ✗</Text>
              </TouchableOpacity>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠ {error}</Text>
              </View>
            )}

            <View style={{ height: 8 }} />
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>
                  {isInstallment ? `Registrar ${installments} parcelas` : 'Registrar gasto'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '92%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textDark },
  closeIcon: { fontSize: 18, color: Colors.textMuted },
  amountInput: {
    fontSize: 36, fontWeight: '800', color: Colors.textDark,
    textAlign: 'center', paddingVertical: 16,
    borderBottomWidth: 2, borderBottomColor: Colors.primary, marginBottom: 20,
  },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6, marginTop: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, marginTop: 4 },
  labelRequired: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  optional: { fontWeight: '400', color: Colors.textMuted },
  emptyPotsBox: {
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, alignItems: 'center', marginBottom: 8,
  },
  emptyPotsText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyPotsLink: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginTop: 8 },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textDark, marginBottom: 4,
  },
  chipScroll: { marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  potChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background, marginRight: 8,
  },
  potChipIcon: { fontSize: 16 },
  potChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  installToggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 4, marginBottom: 12,
  },
  installToggleLabel: { fontSize: 14, color: Colors.textDark, fontWeight: '500' },
  installBox: {
    backgroundColor: Colors.background, borderRadius: 12,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  installSliderLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  installSliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  installCount: { fontSize: 16, fontWeight: '700', color: Colors.primary, minWidth: 36, textAlign: 'right' },
  installPreview: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.lightBlue, borderRadius: 10, padding: 12, marginTop: 10,
  },
  installPreviewLabel: { fontSize: 13, color: Colors.primary },
  installPreviewValue: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  installHint: { fontSize: 11, color: Colors.textMuted, marginTop: 8, textAlign: 'center' },
  needRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  needBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', backgroundColor: Colors.background,
  },
  needBtnYes: { borderColor: Colors.success, backgroundColor: Colors.lightGreen },
  needBtnNo: { borderColor: Colors.danger, backgroundColor: Colors.lightRed },
  needBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  errorBox: {
    backgroundColor: Colors.lightRed, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8,
  },
  errorText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  saveBtn: {
    backgroundColor: Colors.danger, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 12,
    shadowColor: Colors.danger, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
