import React, { useState, useEffect } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { Transaction, Pot } from '../types'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'
import { getPotIcon } from '../lib/potIcons'
import { CreditCard } from '../types'

function calcBillingDate(txISO: string, card: CreditCard, offset = 0): string {
  const [y, m, d] = txISO.split('-').map(Number)
  let month0 = m - 1
  if (d >= card.closing_day) month0 += 1
  if (card.due_day < card.closing_day) month0 += 1
  month0 += offset
  let year = y
  while (month0 > 11) { month0 -= 12; year += 1 }
  return new Date(year, month0, card.due_day).toISOString().split('T')[0]
}

function calcBillingDateNoCard(txISO: string, offset = 0): string {
  const [y, m] = txISO.split('-').map(Number)
  let month0 = m - 1 + 1 + offset
  let year = y
  while (month0 > 11) { month0 -= 12; year += 1 }
  return new Date(year, month0, 1).toISOString().split('T')[0]
}

function genUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

type PayMethod = 'cash' | 'debit' | 'credit' | 'pix' | 'transfer' | 'voucher_alimentacao' | 'voucher_refeicao'
const PAY_METHODS_EXPENSE: { key: PayMethod; label: string }[] = [
  { key: 'cash', label: 'Dinheiro' }, { key: 'debit', label: 'Débito' },
  { key: 'credit', label: 'Crédito' }, { key: 'pix', label: 'Pix' },
  { key: 'voucher_alimentacao', label: '🍽️ Vale Alimentação' },
  { key: 'voucher_refeicao', label: '🍴 Vale Refeição' },
]
const PAY_METHODS_INCOME: { key: PayMethod; label: string }[] = [
  { key: 'pix', label: 'Pix' }, { key: 'transfer', label: 'Transferência' },
  { key: 'cash', label: 'Dinheiro' },
  { key: 'voucher_alimentacao', label: '🍽️ Vale Alimentação' },
  { key: 'voucher_refeicao', label: '🍴 Vale Refeição' },
]

function todayISO() { return new Date().toISOString().split('T')[0] }
function isoToDisplay(iso: string) {
  const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`
}

type Props = {
  visible: boolean
  transaction: Transaction | null
  pots: Pot[]
  onClose: () => void
  onSuccess: (message: string) => void
}

export function EditTransactionModal({ visible, transaction, pots, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets()

  const [amountDigits, setAmountDigits] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPotId, setSelectedPotId] = useState<string | null>(null)
  const [dateISO, setDateISO] = useState(todayISO())
  const [dateDisplay, setDateDisplay] = useState(isoToDisplay(todayISO()))
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('pix')
  const [cards, setCards] = useState<CreditCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [isInstallment, setIsInstallment] = useState(false)
  const [installments, setInstallments] = useState(2)
  const [merchant, setMerchant] = useState('')
  const [isNeed, setIsNeed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible || !transaction) return
    setAmountDigits(String(Math.round(transaction.amount * 100)))
    setDescription(transaction.description ?? '')
    setSelectedPotId(transaction.pot_id)
    setDateISO(transaction.date)
    setDateDisplay(isoToDisplay(transaction.date))
    setPaymentMethod(transaction.payment_method as PayMethod)
    setSelectedCardId(transaction.card_id ?? null)
    setIsInstallment(!!(transaction.installment_group_id))
    setInstallments(transaction.installment_total ?? 2)
    setMerchant(transaction.merchant ?? '')
    setIsNeed(transaction.is_need ?? null)
    setError(null)
    setCards([])
  }, [visible, transaction?.id])

  useEffect(() => {
    if (paymentMethod !== 'credit') return
    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return
    supabase.from('credit_cards').select('*').eq('user_id', userId).then(({ data }) => {
      const list = (data as CreditCard[]) ?? []
      setCards(list)
      // Se já havia card_id salvo e ele está na lista, mantém; senão usa o primeiro
      setSelectedCardId(prev => list.find(c => c.id === prev) ? prev : (list[0]?.id ?? null))
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
    const amount = centsToFloat(amountDigits)
    if (amount <= 0) { setError('Informe um valor maior que zero.'); return }
    if (!transaction) return

    setError(null)
    setLoading(true)
    try {
      const isCredit = paymentMethod === 'credit'
      const card = cards.find(c => c.id === selectedCardId) ?? null
      const userId = useAuthStore.getState().session?.user?.id

      // Converter em parcelado: apaga o lançamento original e cria N parcelas
      if (isCredit && isInstallment && installments >= 2 && !transaction.installment_group_id && userId) {
        const { error: delErr } = await supabase.from('transactions').delete().eq('id', transaction.id)
        if (delErr) { setError('Erro ao excluir original: ' + delErr.message); return }

        const groupId = genUUID()
        const perInstallment = Math.round((amount / installments) * 100) / 100
        const rows = Array.from({ length: installments }, (_, i) => ({
          user_id: userId,
          pot_id: selectedPotId,
          type: transaction.type,
          amount: perInstallment,
          description: description.trim() || null,
          date: dateISO,
          payment_method: paymentMethod,
          card_id: selectedCardId ?? null,
          billing_date: card ? calcBillingDate(dateISO, card, i) : calcBillingDateNoCard(dateISO, i),
          merchant: merchant.trim() || null,
          is_need: isNeed,
          installment_group_id: groupId,
          installment_number: i + 1,
          installment_total: installments,
        }))
        const { error: insErr } = await supabase.from('transactions').insert(rows)
        if (insErr) { setError('Erro ao criar parcelas: ' + insErr.message); return }
        onSuccess(`${installments}x criadas com sucesso!`)
        onClose()
        return
      }

      const installOffset = (transaction.installment_number ?? 1) - 1
      const billingDate = isCredit
        ? (card
            ? calcBillingDate(dateISO, card, installOffset)
            : (transaction.billing_date ?? null))
        : null

      const { error: err } = await supabase.from('transactions').update({
        amount,
        description: description.trim() || null,
        pot_id: selectedPotId,
        date: dateISO,
        payment_method: paymentMethod,
        card_id: isCredit ? (selectedCardId ?? null) : null,
        billing_date: billingDate,
        merchant: transaction.type === 'expense' ? (merchant.trim() || null) : null,
        is_need: transaction.type === 'expense' ? isNeed : null,
      }).eq('id', transaction.id)
      if (err) { setError('Erro ao salvar: ' + err.message); return }
      onSuccess('Lançamento atualizado!')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = () => {
    if (!transaction) return

    if (transaction.installment_group_id) {
      Alert.alert(
        '⚠️ Excluir parcela',
        `Esta é a parcela ${transaction.installment_number}/${transaction.installment_total} de "${transaction.description}".\n\nAo excluir apenas esta parcela, as demais permanecem e devem ser modificadas manualmente mês a mês.\n\nO que deseja excluir?`,
        [
          {
            text: 'Só esta parcela',
            onPress: async () => {
              const { error: err } = await supabase.from('transactions').delete().eq('id', transaction.id)
              if (err) { setError('Erro ao excluir: ' + err.message); return }
              onSuccess('Parcela excluída.')
              onClose()
            },
          },
          {
            text: 'Esta e as seguintes',
            style: 'destructive',
            onPress: async () => {
              const { error: err } = await supabase.from('transactions')
                .delete()
                .eq('installment_group_id', transaction.installment_group_id)
                .gte('installment_number', transaction.installment_number ?? 1)
              if (err) { setError('Erro ao excluir: ' + err.message); return }
              onSuccess('Parcelas restantes excluídas.')
              onClose()
            },
          },
          { text: 'Cancelar', style: 'cancel' },
        ]
      )
    } else {
      Alert.alert(
        'Excluir lançamento',
        'Deseja excluir este lançamento? Esta ação não pode ser desfeita.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir', style: 'destructive',
            onPress: async () => {
              const { error: err } = await supabase.from('transactions').delete().eq('id', transaction.id)
              if (err) { setError('Erro ao excluir: ' + err.message); return }
              onSuccess('Lançamento excluído.')
              onClose()
            },
          },
        ]
      )
    }
  }

  if (!transaction) return null
  const isExpense = transaction.type === 'expense'
  const payMethods = isExpense ? PAY_METHODS_EXPENSE : PAY_METHODS_INCOME

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject as any} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Editar lançamento</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TextInput
              style={[styles.amountInput, { borderBottomColor: isExpense ? Colors.danger : Colors.success }]}
              value={formatCents(amountDigits)}
              onChangeText={t => { setAmountDigits(digitsOnly(t)); setError(null) }}
              keyboardType="numeric"
              placeholder="R$ 0,00"
              placeholderTextColor={Colors.textMuted}
              textAlign="center"
            />

            <Text style={styles.label}>Descrição</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Descrição…"
              placeholderTextColor={Colors.textMuted}
            />

            {isExpense && pots.length > 0 && (
              <>
                <Text style={styles.label}>Pote</Text>
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
              </>
            )}

            <Text style={styles.label}>Data</Text>
            <TextInput
              style={styles.input}
              value={dateDisplay}
              onChangeText={handleDateInput}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Forma de {isExpense ? 'pagamento' : 'recebimento'}</Text>
            <View style={styles.chipRow}>
              {payMethods.map(m => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.chip, paymentMethod === m.key && (isExpense ? styles.chipActiveBlue : styles.chipActiveGreen)]}
                  onPress={() => setPaymentMethod(m.key)}
                >
                  <Text style={[styles.chipText, paymentMethod === m.key && (isExpense ? styles.chipTextBlue : styles.chipTextGreen)]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isExpense && paymentMethod === 'credit' && (
              <>
                <Text style={styles.label}>Cartão</Text>
                {cards.length === 0 ? (
                  <Text style={styles.hint}>Nenhum cartão cadastrado.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {cards.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.chip, selectedCardId === c.id && styles.chipActiveBlue]}
                        onPress={() => setSelectedCardId(c.id)}
                      >
                        <Text style={[styles.chipText, selectedCardId === c.id && styles.chipTextBlue]}>
                          {c.name}{c.last_four ? ` ••${c.last_four}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {isExpense && paymentMethod === 'credit' && transaction && !transaction.installment_group_id && (
              <View style={styles.installmentRow}>
                <TouchableOpacity
                  style={[styles.installmentToggle, isInstallment && styles.installmentToggleActive]}
                  onPress={() => setIsInstallment(v => !v)}
                >
                  <Text style={[styles.installmentToggleText, isInstallment && styles.installmentToggleTextActive]}>
                    💳 Parcelar
                  </Text>
                </TouchableOpacity>
                {isInstallment && (
                  <View style={styles.installmentCounter}>
                    <TouchableOpacity onPress={() => setInstallments(v => Math.max(2, v - 1))} style={styles.counterBtn}>
                      <Text style={styles.counterBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.counterValue}>{installments}x</Text>
                    <TouchableOpacity onPress={() => setInstallments(v => Math.min(24, v + 1))} style={styles.counterBtn}>
                      <Text style={styles.counterBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {isExpense && paymentMethod === 'credit' && transaction?.installment_group_id && (
              <View style={styles.installmentBadge}>
                <Text style={styles.installmentBadgeText}>
                  💳 Parcela {transaction.installment_number}/{transaction.installment_total}
                </Text>
              </View>
            )}

            {isExpense && (
              <>
                <Text style={styles.label}>Estabelecimento <Text style={styles.optional}>(opcional)</Text></Text>
                <TextInput
                  style={styles.input}
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="Ex: Mercado, iFood…"
                  placeholderTextColor={Colors.textMuted}
                />
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
              </>
            )}

            {error ? (
              <View style={styles.errorBox}><Text style={styles.errorText}>⚠ {error}</Text></View>
            ) : null}
            <View style={{ height: 8 }} />
          </ScrollView>

          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>🗑 Excluir lançamento</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: isExpense ? Colors.danger : Colors.success }, loading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Salvar alterações</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '90%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textDark },
  closeIcon: { fontSize: 18, color: Colors.textMuted },
  amountInput: {
    fontSize: 36, fontWeight: '800', color: Colors.textDark,
    textAlign: 'center', paddingVertical: 16,
    borderBottomWidth: 2, marginBottom: 20,
  },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6, marginTop: 4 },
  optional: { fontWeight: '400', color: Colors.textMuted },
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
  chipActiveBlue: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  chipActiveGreen: { borderColor: Colors.success, backgroundColor: Colors.lightGreen },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  chipTextBlue: { color: Colors.primary },
  chipTextGreen: { color: Colors.success },
  potChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background, marginRight: 8,
  },
  potChipIcon: { fontSize: 16 },
  potChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  needRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  needBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', backgroundColor: Colors.background,
  },
  needBtnYes: { borderColor: Colors.success, backgroundColor: Colors.lightGreen },
  needBtnNo: { borderColor: Colors.danger, backgroundColor: Colors.lightRed },
  needBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  installmentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  installmentToggle: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  installmentToggleActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  installmentToggleText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  installmentToggleTextActive: { color: Colors.primary },
  installmentCounter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1.5,
    borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  counterBtnText: { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 22 },
  counterValue: { fontSize: 16, fontWeight: '700', color: Colors.textDark, minWidth: 32, textAlign: 'center' },
  installmentBadge: {
    backgroundColor: Colors.lightBlue, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.primary + '40', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
  },
  installmentBadgeText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  errorBox: {
    backgroundColor: Colors.lightRed, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8,
  },
  errorText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  deleteBtn: {
    borderWidth: 1.5, borderColor: Colors.danger, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 8, marginBottom: 8,
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: Colors.danger },
  saveBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
