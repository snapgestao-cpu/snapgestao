import React, { useState, useEffect } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { IncomeSource } from '../types'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'
import { brl } from '../lib/finance'

const SOURCE_TYPES: { key: IncomeSource['type']; label: string }[] = [
  { key: 'salary', label: 'Salário' },
  { key: 'freelance', label: 'Freela' },
  { key: 'rent', label: 'Aluguel' },
  { key: 'dividend', label: 'Dividendos' },
  { key: 'other', label: 'Outro' },
]

type FormState = {
  name: string
  type: IncomeSource['type']
  amountDigits: string
  recurrenceDay: string
  isPrimary: boolean
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'salary',
  amountDigits: '',
  recurrenceDay: '5',
  isPrimary: false,
}

type Props = {
  visible: boolean
  onClose: () => void
  onChanged?: () => void
}

export function IncomeSourcesModal({ visible, onClose, onChanged }: Props) {
  const insets = useSafeAreaInsets()

  const [sources, setSources] = useState<IncomeSource[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSources = async () => {
    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return
    setFetching(true)
    const { data } = await supabase
      .from('income_sources').select('*').eq('user_id', userId).order('created_at')
    setSources((data as IncomeSource[]) ?? [])
    setFetching(false)
  }

  useEffect(() => {
    if (!visible) return
    loadSources()
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }, [visible])

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setError(null)
    setShowForm(true)
  }

  const openEdit = (src: IncomeSource) => {
    setForm({
      name: src.name,
      type: src.type,
      amountDigits: String(Math.round(src.amount * 100)),
      recurrenceDay: String(src.recurrence_day),
      isPrimary: src.is_primary,
    })
    setEditingId(src.id)
    setError(null)
    setShowForm(true)
  }

  const handleDelete = (src: IncomeSource) => {
    Alert.alert('Excluir fonte', `Deseja excluir "${src.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          await supabase.from('income_sources').delete().eq('id', src.id)
          loadSources()
          onChanged?.()
        },
      },
    ])
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Informe o nome da fonte.'); return }
    const amount = centsToFloat(form.amountDigits)
    if (amount <= 0) { setError('Informe um valor maior que zero.'); return }

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return

    setError(null)
    setLoading(true)
    try {
      const payload = {
        user_id: userId,
        name: form.name.trim(),
        type: form.type,
        amount,
        recurrence_day: Number(form.recurrenceDay) || 5,
        is_primary: form.isPrimary,
      }

      if (editingId) {
        await supabase.from('income_sources').update(payload).eq('id', editingId)
      } else {
        await supabase.from('income_sources').insert(payload)
      }
      setShowForm(false)
      loadSources()
      onChanged?.()
    } finally {
      setLoading(false)
    }
  }

  const totalMonthly = sources.reduce((s, src) => s + src.amount, 0)

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
            <Text style={styles.headerTitle}>
              {showForm ? (editingId ? 'Editar fonte' : 'Nova fonte') : 'Fontes de receita'}
            </Text>
            <TouchableOpacity
              onPress={showForm ? () => setShowForm(false) : onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeIcon}>{showForm ? '← Voltar' : '✕'}</Text>
            </TouchableOpacity>
          </View>

          {showForm ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Nome</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={t => setForm(f => ({ ...f, name: t }))}
                placeholder="Ex: Salário CLT, Freela Mensal…"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.label}>Tipo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {SOURCE_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.chip, form.type === t.key && styles.chipActive]}
                    onPress={() => setForm(f => ({ ...f, type: t.key }))}
                  >
                    <Text style={[styles.chipText, form.type === t.key && styles.chipTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Valor mensal</Text>
              <TextInput
                style={styles.input}
                value={formatCents(form.amountDigits)}
                onChangeText={t => setForm(f => ({ ...f, amountDigits: digitsOnly(t) }))}
                keyboardType="numeric"
                placeholder="R$ 0,00"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.label}>Dia de recebimento</Text>
              <TextInput
                style={styles.input}
                value={form.recurrenceDay}
                onChangeText={t => setForm(f => ({ ...f, recurrenceDay: t.replace(/\D/g, '').slice(0, 2) }))}
                keyboardType="numeric"
                placeholder="5"
                placeholderTextColor={Colors.textMuted}
              />

              {/* Fonte principal */}
              <TouchableOpacity
                style={styles.primaryRow}
                onPress={() => setForm(f => ({ ...f, isPrimary: !f.isPrimary }))}
              >
                <View style={[styles.checkbox, form.isPrimary && styles.checkboxActive]}>
                  {form.isPrimary && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.primaryLabel}>Fonte principal de renda</Text>
              </TouchableOpacity>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠ {error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.saveBtn, loading && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>{editingId ? 'Salvar' : 'Adicionar'}</Text>
                }
              </TouchableOpacity>
              <View style={{ height: 8 }} />
            </ScrollView>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {sources.length > 0 && (
                <View style={styles.totalCard}>
                  <Text style={styles.totalLabel}>Total mensal</Text>
                  <Text style={styles.totalValue}>{brl(totalMonthly)}</Text>
                </View>
              )}

              {fetching ? (
                <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
              ) : sources.length === 0 ? (
                <Text style={styles.empty}>Nenhuma fonte cadastrada.</Text>
              ) : (
                sources.map(src => (
                  <View key={src.id} style={styles.sourceRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.sourceTitleRow}>
                        <Text style={styles.sourceName}>{src.name}</Text>
                        {src.is_primary && (
                          <View style={styles.primaryBadge}>
                            <Text style={styles.primaryBadgeText}>Principal</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.sourceMeta}>
                        {SOURCE_TYPES.find(t => t.key === src.type)?.label ?? src.type}
                        {' · '}dia {src.recurrence_day}
                      </Text>
                    </View>
                    <Text style={styles.sourceAmount}>{brl(src.amount)}</Text>
                    <TouchableOpacity onPress={() => openEdit(src)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}>
                      <Text style={styles.editBtn}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(src)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                      <Text style={styles.deleteBtn}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
                <Text style={styles.addBtnText}>+ Adicionar fonte</Text>
              </TouchableOpacity>
              <View style={{ height: 8 }} />
            </ScrollView>
          )}
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
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '88%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textDark },
  closeIcon: { fontSize: 15, color: Colors.textMuted, fontWeight: '600' },
  totalCard: {
    backgroundColor: Colors.lightGreen, borderRadius: 12,
    padding: 14, marginBottom: 12,
  },
  totalLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 2 },
  totalValue: { fontSize: 20, fontWeight: '800', color: Colors.success },
  empty: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 24, marginBottom: 8 },
  sourceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sourceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sourceName: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  primaryBadge: {
    backgroundColor: Colors.lightGreen, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  primaryBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.success },
  sourceMeta: { fontSize: 12, color: Colors.textMuted },
  sourceAmount: { fontSize: 14, fontWeight: '700', color: Colors.success },
  editBtn: { fontSize: 18, padding: 4 },
  deleteBtn: { fontSize: 18, padding: 4 },
  addBtn: {
    backgroundColor: Colors.lightGreen, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 16,
    borderWidth: 1.5, borderColor: Colors.success + '40', borderStyle: 'dashed',
  },
  addBtnText: { color: Colors.success, fontSize: 14, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textDark, marginBottom: 4,
  },
  chipScroll: { marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background, marginRight: 8,
  },
  chipActive: { borderColor: Colors.success, backgroundColor: Colors.lightGreen },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.success },
  primaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 4 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  primaryLabel: { fontSize: 14, color: Colors.textDark, fontWeight: '500' },
  errorBox: {
    backgroundColor: Colors.lightRed, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 8,
  },
  errorText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  saveBtn: {
    backgroundColor: Colors.success, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
    shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
