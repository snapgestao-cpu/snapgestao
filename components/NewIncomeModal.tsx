import React, { useState, useEffect } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { IncomeSource } from '../types'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'

type PayMethod = 'pix' | 'transfer' | 'cash' | 'voucher_alimentacao' | 'voucher_refeicao'

const PAY_METHODS: { key: PayMethod; label: string }[] = [
  { key: 'pix',                 label: 'Pix' },
  { key: 'transfer',            label: 'Transferência' },
  { key: 'cash',                label: 'Dinheiro' },
  { key: 'voucher_alimentacao', label: '🍽️ Vale Alimentação' },
  { key: 'voucher_refeicao',    label: '🍴 Vale Refeição' },
]

type IncomeType = 'salary' | 'freelance' | 'voucher_alimentacao' | 'voucher_refeicao' | 'other'

const INCOME_TYPES: { key: IncomeType; label: string; payMethod: PayMethod }[] = [
  { key: 'salary',              label: '💼 Salário',         payMethod: 'transfer' },
  { key: 'freelance',           label: '🧑‍💻 Freelance',      payMethod: 'pix' },
  { key: 'voucher_alimentacao', label: '🍽️ Vale Alimentação', payMethod: 'voucher_alimentacao' },
  { key: 'voucher_refeicao',    label: '🍴 Vale Refeição',   payMethod: 'voucher_refeicao' },
  { key: 'other',               label: '💰 Outro',           payMethod: 'pix' },
]

type Props = {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
  initialDate?: string
}

function todayISO() { return new Date().toISOString().split('T')[0] }
function isoToDisplay(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function NewIncomeModal({ visible, onClose, onSuccess, initialDate }: Props) {
  const insets = useSafeAreaInsets()

  const [amountDigits, setAmountDigits] = useState('')
  const [description, setDescription] = useState('')
  const [sources, setSources] = useState<IncomeSource[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string | 'avulsa' | null>(null)
  const [incomeType, setIncomeType] = useState<IncomeType>('other')
  const [dateISO, setDateISO] = useState(todayISO())
  const [dateDisplay, setDateDisplay] = useState(isoToDisplay(todayISO()))
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('pix')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setAmountDigits('')
    setDescription('')
    setSelectedSourceId(null)
    setIncomeType('other')
    const d = initialDate ?? todayISO()
    setDateISO(d)
    setDateDisplay(isoToDisplay(d))
    setPaymentMethod('pix')
    setError(null)

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return
    supabase.from('income_sources').select('*').eq('user_id', userId)
      .then(({ data }) => setSources((data as IncomeSource[]) ?? []))
  }, [visible])

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

  const handleIncomeTypeSelect = (type: IncomeType) => {
    setIncomeType(type)
    const entry = INCOME_TYPES.find(t => t.key === type)
    if (entry) setPaymentMethod(entry.payMethod)
    if (type === 'voucher_alimentacao') setDescription('Vale Alimentação')
    else if (type === 'voucher_refeicao') setDescription('Vale Refeição')
    else if (type !== 'other') { /* keep current description */ }
  }

  const handleSourceSelect = (id: string | 'avulsa') => {
    setSelectedSourceId(id === selectedSourceId ? null : id)
    if (id !== 'avulsa') {
      const src = sources.find(s => s.id === id)
      if (src) setDescription(src.name)
    } else {
      setDescription('')
    }
  }

  const handleSave = async () => {
    const amount = centsToFloat(amountDigits)
    if (amount <= 0) { setError('Informe um valor maior que zero.'); return }

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) { setError('Sessão inválida.'); return }

    setError(null)
    setLoading(true)
    try {
      const { error: txErr } = await supabase.from('transactions').insert({
        user_id: userId,
        pot_id: null,
        card_id: null,
        type: 'income',
        amount,
        description: description.trim() || null,
        merchant: null,
        date: dateISO,
        billing_date: null,
        payment_method: paymentMethod,
        is_need: null,
      })
      if (txErr) { setError('Erro ao salvar: ' + txErr.message); return }

      onSuccess()
      onClose()
    } finally {
      setLoading(false)
    }
  }

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
            <Text style={styles.headerTitle}>Nova Receita</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TextInput
              style={styles.amountInput}
              value={formatCents(amountDigits)}
              onChangeText={t => { setAmountDigits(digitsOnly(t)); setError(null) }}
              keyboardType="numeric"
              placeholder="R$ 0,00"
              placeholderTextColor={Colors.textMuted}
              textAlign="center"
            />

            {/* Tipo de receita */}
            <Text style={styles.label}>Tipo de receita</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {INCOME_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.chip, incomeType === t.key && styles.chipActiveGreen]}
                  onPress={() => handleIncomeTypeSelect(t.key)}
                >
                  <Text style={[styles.chipText, incomeType === t.key && styles.chipTextGreen]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Fonte de receita */}
            {sources.length > 0 && (
              <>
                <Text style={styles.label}>Fonte de receita</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {sources.map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.chip, selectedSourceId === s.id && styles.chipActive]}
                      onPress={() => handleSourceSelect(s.id)}
                    >
                      <Text style={[styles.chipText, selectedSourceId === s.id && styles.chipTextActive]}>
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[styles.chip, selectedSourceId === 'avulsa' && styles.chipActive]}
                    onPress={() => handleSourceSelect('avulsa')}
                  >
                    <Text style={[styles.chipText, selectedSourceId === 'avulsa' && styles.chipTextActive]}>
                      Receita avulsa
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* Descrição */}
            <Text style={styles.label}>Descrição</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Ex: Salário março, Freelance…"
              placeholderTextColor={Colors.textMuted}
            />

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

            {/* Forma de recebimento */}
            <Text style={styles.label}>Forma de recebimento</Text>
            <View style={styles.chipRow}>
              {PAY_METHODS.map(m => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.chip, paymentMethod === m.key && styles.chipActiveGreen]}
                  onPress={() => setPaymentMethod(m.key)}
                >
                  <Text style={[styles.chipText, paymentMethod === m.key && styles.chipTextGreen]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
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
              : <Text style={styles.saveBtnText}>Registrar receita</Text>
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
    maxHeight: '85%',
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
    borderBottomWidth: 2, borderBottomColor: Colors.success, marginBottom: 20,
  },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textDark, marginBottom: 4,
  },
  chipScroll: { marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
    marginRight: 8,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  chipActiveGreen: { borderColor: Colors.success, backgroundColor: Colors.lightGreen },
  chipTextGreen: { color: Colors.success },
  errorBox: {
    backgroundColor: Colors.lightRed, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8,
  },
  errorText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  saveBtn: {
    backgroundColor: Colors.success, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 12,
    shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
