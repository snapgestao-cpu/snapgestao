import React, { useState, useEffect } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { Pot } from '../types'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'
import { PotCard } from './PotCard'

export const POT_COLORS = [
  '#0F5EA8', '#1D9E75', '#E24B4A', '#BA7517',
  '#534AB7', '#D4537E', '#0891B2', '#059669',
  '#DC6803', '#7C3AED', '#DB2777', '#374151',
]

const SUGGESTIONS = [
  'Alimentação', 'Moradia', 'Transporte', 'Saúde',
  'Lazer', 'Educação', 'Vestuário', 'Pet', 'Investimento',
]

type LimitType = 'absolute' | 'percent_income'

type Props = {
  visible: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  editPot?: Pot
  totalIncome: number
}

export function NewPotModal({ visible, onClose, onSuccess, editPot, totalIncome }: Props) {
  const insets = useSafeAreaInsets()

  const [name, setName] = useState('')
  const [color, setColor] = useState(POT_COLORS[0])
  const [limitDigits, setLimitDigits] = useState('')
  const [limitType, setLimitType] = useState<LimitType>('absolute')
  const [percentStr, setPercentStr] = useState('')
  const [isEmergency, setIsEmergency] = useState(false)
  const [existingEmergencyName, setExistingEmergencyName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    if (editPot) {
      setName(editPot.name)
      setColor(editPot.color)
      setLimitType(editPot.limit_type)
      setLimitDigits(editPot.limit_amount ? String(Math.round(editPot.limit_amount * 100)) : '')
      setPercentStr('')
      setIsEmergency(editPot.is_emergency)
    } else {
      setName('')
      setColor(POT_COLORS[0])
      setLimitDigits('')
      setLimitType('absolute')
      setPercentStr('')
      setIsEmergency(false)
    }
    setError(null)

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return
    supabase.from('pots')
      .select('name')
      .eq('user_id', userId)
      .eq('is_emergency', true)
      .then(({ data }) => {
        const found = (data ?? [])[0] as { name: string } | undefined
        // Don't block toggle if we're editing the emergency pot itself
        setExistingEmergencyName(editPot?.is_emergency ? null : (found?.name ?? null))
      })
  }, [visible])

  const computedLimit: number =
    limitType === 'percent_income'
      ? totalIncome * (Number(percentStr || '0') / 100)
      : centsToFloat(limitDigits)

  const handleSave = async () => {
    if (!name.trim()) { setError('Informe o nome do pote.'); return }
    if (computedLimit <= 0) { setError('Informe um limite maior que zero.'); return }

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) { setError('Sessão inválida.'); return }

    setError(null)
    setLoading(true)
    try {
      const payload = {
        user_id: userId,
        name: name.trim(),
        color,
        limit_amount: computedLimit,
        limit_type: limitType,
        is_emergency: isEmergency,
      }

      if (editPot) {
        const { error: err } = await supabase.from('pots').update(payload).eq('id', editPot.id)
        if (err) { setError('Erro ao atualizar: ' + err.message); return }
        onSuccess('Pote atualizado!')
      } else {
        const { error: err } = await supabase.from('pots').insert(payload)
        if (err) { setError('Erro ao criar: ' + err.message); return }
        onSuccess('Pote criado com sucesso!')
      }
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const previewLimit = computedLimit > 0 ? computedLimit : undefined

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
            <Text style={styles.headerTitle}>{editPot ? 'Editar pote' : 'Novo pote'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Nome */}
            <Text style={styles.label}>Nome do pote</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={t => { setName(t); setError(null) }}
              placeholder="Ex: Alimentação, Moradia…"
              placeholderTextColor={Colors.textMuted}
            />

            {/* Sugestões */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {SUGGESTIONS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, name === s && styles.chipActive]}
                  onPress={() => setName(s)}
                >
                  <Text style={[styles.chipText, name === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tipo de limite */}
            <Text style={styles.label}>Limite mensal</Text>
            <View style={styles.limitTypeRow}>
              {(['absolute', 'percent_income'] as LimitType[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, limitType === t && styles.chipActive]}
                  onPress={() => setLimitType(t)}
                >
                  <Text style={[styles.chipText, limitType === t && styles.chipTextActive]}>
                    {t === 'absolute' ? 'Valor fixo' : '% da renda'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {limitType === 'absolute' ? (
              <TextInput
                style={styles.input}
                value={formatCents(limitDigits)}
                onChangeText={t => { setLimitDigits(digitsOnly(t)); setError(null) }}
                keyboardType="numeric"
                placeholder="R$ 0,00"
                placeholderTextColor={Colors.textMuted}
              />
            ) : (
              <View>
                <TextInput
                  style={styles.input}
                  value={percentStr ? `${percentStr}%` : ''}
                  onChangeText={t => {
                    setPercentStr(t.replace(/\D/g, '').slice(0, 3))
                    setError(null)
                  }}
                  keyboardType="numeric"
                  placeholder="Ex: 30%"
                  placeholderTextColor={Colors.textMuted}
                />
                {Number(percentStr || 0) > 0 && totalIncome > 0 ? (
                  <Text style={styles.hint}>
                    = {computedLimit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / mês
                  </Text>
                ) : totalIncome === 0 ? (
                  <Text style={styles.hint}>Cadastre fontes de receita para usar esta opção.</Text>
                ) : null}
              </View>
            )}

            {/* Cor */}
            <Text style={styles.label}>Cor</Text>
            <View style={styles.colorGrid}>
              {POT_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotSelected]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>

            {/* Pote de emergência */}
            <View style={styles.emergencyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.emergencyLabel}>Pote de emergência 🛡️</Text>
                {existingEmergencyName && !isEmergency ? (
                  <Text style={styles.hint}>Você já tem um: {existingEmergencyName}</Text>
                ) : null}
              </View>
              <Switch
                value={isEmergency}
                onValueChange={v => {
                  if (v && existingEmergencyName) return
                  setIsEmergency(v)
                  if (v) setColor('#534AB7')
                }}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={isEmergency ? Colors.primary : '#f4f3f4'}
                disabled={!!existingEmergencyName && !isEmergency}
              />
            </View>

            {/* Preview */}
            {name.trim() ? (
              <>
                <Text style={styles.label}>Preview</Text>
                <PotCard
                  name={name}
                  color={color}
                  limit_amount={previewLimit}
                  spent={0}
                  remaining={previewLimit ?? 0}
                />
              </>
            ) : null}

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
              : <Text style={styles.saveBtnText}>{editPot ? 'Salvar alterações' : 'Criar pote'}</Text>
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
  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textDark, marginBottom: 4,
  },
  chipScroll: { marginBottom: 8 },
  limitTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
    marginRight: 8,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  colorDot: { width: 36, height: 36, borderRadius: 18 },
  colorDotSelected: { borderWidth: 3, borderColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  emergencyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, marginVertical: 4,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  emergencyLabel: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 2, marginBottom: 4 },
  errorBox: {
    backgroundColor: Colors.lightRed, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 8, marginBottom: 4,
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
