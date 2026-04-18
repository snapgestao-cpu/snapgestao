import React, { useState, useEffect } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { Goal } from '../types'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'
import { calcFV, brl } from '../lib/finance'

type Props = {
  visible: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  editGoal?: Goal
}

function horizonLabel(years: number, months: number): string {
  const parts: string[] = []
  if (years > 0) parts.push(`${years} ano${years !== 1 ? 's' : ''}`)
  if (months > 0) parts.push(`${months} mês${months !== 1 ? 'es' : ''}`)
  return parts.length > 0 ? parts.join(' e ') : '0 meses'
}

export function NewGoalModal({ visible, onClose, onSuccess, editGoal }: Props) {
  const insets = useSafeAreaInsets()

  const [name, setName] = useState('')
  const [targetDigits, setTargetDigits] = useState('')
  const [horizonYears, setHorizonYears] = useState('5')
  const [horizonMonths, setHorizonMonths] = useState('0')
  const [depositDigits, setDepositDigits] = useState('')
  const [rateStr, setRateStr] = useState('8')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    if (editGoal) {
      setName(editGoal.name)
      setTargetDigits(String(Math.round(editGoal.target_amount * 100)))
      const totalMonths = Math.round(editGoal.horizon_years * 12)
      setHorizonYears(String(Math.floor(totalMonths / 12)))
      setHorizonMonths(String(totalMonths % 12))
      setDepositDigits(editGoal.monthly_deposit ? String(Math.round(editGoal.monthly_deposit * 100)) : '')
      setRateStr(editGoal.interest_rate ? String(editGoal.interest_rate) : '8')
    } else {
      setName('')
      setTargetDigits('')
      setHorizonYears('5')
      setHorizonMonths('0')
      setDepositDigits('')
      setRateStr('8')
    }
    setError(null)
  }, [visible])

  const yrs = Math.max(0, parseInt(horizonYears || '0'))
  const mos = Math.max(0, Math.min(11, parseInt(horizonMonths || '0')))
  const totalMonths = yrs * 12 + mos
  const horizonDecimal = totalMonths / 12

  const monthlyDeposit = centsToFloat(depositDigits)
  const annualRate = Number(rateStr || '0')
  const projectedFV = calcFV(monthlyDeposit, annualRate, horizonDecimal)

  const handleSave = async () => {
    const target = centsToFloat(targetDigits)
    if (!name.trim()) { setError('Informe o nome da meta.'); return }
    if (target <= 0) { setError('Informe um valor alvo maior que zero.'); return }
    if (totalMonths <= 0) { setError('Informe um prazo maior que zero.'); return }

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) { setError('Sessão inválida.'); return }

    const targetDate = new Date()
    targetDate.setMonth(targetDate.getMonth() + totalMonths)

    setError(null)
    setLoading(true)
    try {
      const payload = {
        user_id: userId,
        name: name.trim(),
        target_amount: target,
        horizon_years: horizonDecimal,
        monthly_deposit: monthlyDeposit > 0 ? monthlyDeposit : null,
        interest_rate: annualRate > 0 ? annualRate : null,
        target_date: targetDate.toISOString().split('T')[0],
      }

      if (editGoal) {
        const { error: err } = await supabase.from('goals').update(payload).eq('id', editGoal.id)
        if (err) { setError('Erro ao atualizar: ' + err.message); return }
        onSuccess('Meta atualizada!')
      } else {
        const { error: err } = await supabase.from('goals').insert({ ...payload, current_amount: 0 })
        if (err) { setError('Erro ao criar: ' + err.message); return }
        onSuccess('Meta criada com sucesso!')
      }
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
            <Text style={styles.headerTitle}>{editGoal ? 'Editar meta' : 'Nova meta'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            <Text style={styles.label}>Nome da meta</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={t => { setName(t); setError(null) }}
              placeholder="Ex: Viagem Europa, Entrada Imóvel…"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.label}>Valor alvo</Text>
            <TextInput
              style={styles.input}
              value={formatCents(targetDigits)}
              onChangeText={t => { setTargetDigits(digitsOnly(t)); setError(null) }}
              keyboardType="numeric"
              placeholder="R$ 0,00"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.label}>
              Prazo — <Text style={styles.labelHighlight}>{horizonLabel(yrs, mos)}</Text>
            </Text>
            <View style={styles.horizonRow}>
              <View style={styles.horizonField}>
                <Text style={styles.horizonFieldLabel}>Anos</Text>
                <TextInput
                  style={styles.horizonInput}
                  value={horizonYears}
                  onChangeText={t => setHorizonYears(t.replace(/\D/g, '').slice(0, 3))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="center"
                />
              </View>
              <Text style={styles.horizonSep}>e</Text>
              <View style={styles.horizonField}>
                <Text style={styles.horizonFieldLabel}>Meses</Text>
                <TextInput
                  style={styles.horizonInput}
                  value={horizonMonths}
                  onChangeText={t => {
                    const v = parseInt(t.replace(/\D/g, '') || '0')
                    setHorizonMonths(String(Math.min(11, v)))
                  }}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="center"
                />
              </View>
            </View>

            <Text style={styles.label}>Aporte mensal planejado</Text>
            <TextInput
              style={styles.input}
              value={formatCents(depositDigits)}
              onChangeText={t => setDepositDigits(digitsOnly(t))}
              keyboardType="numeric"
              placeholder="R$ 0,00"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.label}>Taxa de juros estimada (% ao ano)</Text>
            <TextInput
              style={styles.input}
              value={rateStr}
              onChangeText={t => setRateStr(t.replace(/[^0-9.]/g, '').slice(0, 5))}
              keyboardType="decimal-pad"
              placeholder="8"
              placeholderTextColor={Colors.textMuted}
            />

            {monthlyDeposit > 0 && totalMonths > 0 && (
              <View style={styles.simulator}>
                <Text style={styles.simTitle}>SIMULAÇÃO</Text>
                <Text style={styles.simMain}>
                  Com {brl(monthlyDeposit)}/mês você terá{' '}
                  <Text style={styles.simHighlight}>{brl(projectedFV)}</Text>
                </Text>
                <Text style={styles.simSub}>
                  em {horizonLabel(yrs, mos)} · taxa de {annualRate}% ao ano
                </Text>
                {projectedFV >= centsToFloat(targetDigits) && centsToFloat(targetDigits) > 0 ? (
                  <Text style={styles.simSuccess}>✓ Você alcança a meta!</Text>
                ) : centsToFloat(targetDigits) > 0 ? (
                  <Text style={styles.simGap}>
                    Faltam {brl(centsToFloat(targetDigits) - projectedFV)} para atingir a meta
                  </Text>
                ) : null}
              </View>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠ {error}</Text>
              </View>
            ) : null}

            <View style={{ height: 8 }} />
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>{editGoal ? 'Salvar alterações' : 'Criar meta'}</Text>
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
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textDark },
  closeIcon: { fontSize: 18, color: Colors.textMuted },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6, marginTop: 8 },
  labelHighlight: { color: Colors.primary, fontWeight: '700' },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textDark, marginBottom: 4,
  },
  horizonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  horizonField: { flex: 1, alignItems: 'center' },
  horizonFieldLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4, fontWeight: '600' },
  horizonInput: {
    width: '100%', backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.primary,
    paddingVertical: 12, fontSize: 22, fontWeight: '700', color: Colors.textDark,
    textAlign: 'center',
  },
  horizonSep: { fontSize: 16, color: Colors.textMuted, fontWeight: '600', paddingTop: 20 },
  simulator: {
    backgroundColor: Colors.lightBlue, borderRadius: 12,
    padding: 14, marginTop: 12, marginBottom: 8,
  },
  simTitle: { fontSize: 11, fontWeight: '700', color: Colors.primary, letterSpacing: 0.5, marginBottom: 6 },
  simMain: { fontSize: 14, color: Colors.textDark, lineHeight: 22 },
  simHighlight: { fontWeight: '800', color: Colors.primary },
  simSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  simSuccess: { fontSize: 13, color: Colors.success, fontWeight: '700', marginTop: 6 },
  simGap: { fontSize: 12, color: Colors.warning, marginTop: 6, fontWeight: '600' },
  errorBox: {
    backgroundColor: Colors.lightRed, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 8,
  },
  errorText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
