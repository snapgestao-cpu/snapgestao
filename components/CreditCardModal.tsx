/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 25/05/2026
 *
 * Modal de cadastro e edição de cartões de crédito. Coleta
 * nome, banco, dia de fechamento e dia de vencimento.
 * Usado na tela de Perfil para gerenciar cartões do usuário.
 */

import React, { useState, useEffect } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { CreditCard } from '../types'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'
import { getFutureInstallments, deleteCardWithCascade, recalculateFutureInstallments, analyzeRecalculation } from '../lib/credit-cards'
import { getCycle } from '../lib/cycle'
import { brl } from '../lib/finance'
import { PLAN_LIMITS } from '../constants/plans'
import { router } from 'expo-router'
import { getCardImage } from '../constants/cardBrands'
import CardBrandPicker from './CardBrandPicker'

type FormState = {
  name: string
  lastFour: string
  closingDay: string
  dueDay: string
  limitDigits: string
  brand: string
}

const EMPTY_FORM: FormState = {
  name: '', lastFour: '', closingDay: '', dueDay: '', limitDigits: '', brand: 'generic',
}

type Props = {
  visible: boolean
  onClose: () => void
}

export function CreditCardModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets()

  const [cards, setCards] = useState<CreditCard[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCards = async () => {
    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return
    setFetching(true)
    const { data } = await supabase.from('credit_cards').select('*').eq('user_id', userId).order('created_at')
    setCards((data as CreditCard[]) ?? [])
    setFetching(false)
  }

  useEffect(() => {
    if (!visible) return
    loadCards()
    setShowForm(false)
    setShowPicker(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }, [visible])

  const openAdd = () => {
    const plan = useAuthStore.getState().user?.plan ?? 'free'
    const limit = PLAN_LIMITS[plan].creditCards
    if (limit !== Infinity && cards.length >= limit) {
      Alert.alert(
        'Limite atingido',
        `Você atingiu o limite de ${limit} cartões no plano gratuito. Faça upgrade para o Premium e cadastre cartões ilimitados.`,
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Ver Premium', onPress: () => { onClose(); router.push('/premium' as any) } },
        ]
      )
      return
    }
    setForm(EMPTY_FORM)
    setEditingId(null)
    setError(null)
    setShowForm(true)
  }

  const openEdit = (card: CreditCard) => {
    setForm({
      name: card.name,
      lastFour: card.last_four ?? '',
      closingDay: String(card.closing_day),
      dueDay: String(card.due_day),
      limitDigits: card.credit_limit ? String(Math.round(card.credit_limit * 100)) : '',
      brand: card.brand ?? 'generic',
    })
    setEditingId(card.id)
    setError(null)
    setShowForm(true)
  }

  const handleDelete = async (card: CreditCard) => {
    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return
    const cycleStart = useAuthStore.getState().user?.cycle_start ?? 1
    const { endISO } = getCycle(cycleStart, 0)

    const { count, total } = await getFutureInstallments(userId, card.id, endISO)

    if (count > 0) {
      const nextMonth = endISO.substring(0, 7).replace(/(\d{4})-(\d{2})/, (_, y, m) => {
        const next = new Date(Number(y), Number(m), 1)
        return `${String(next.getMonth() + 1).padStart(2, '0')}/${next.getFullYear()}`
      })
      Alert.alert(
        '⚠️ Cartão com parcelas futuras',
        `O cartão "${card.name}" possui ${count} parcela(s) com vencimento a partir de ${nextMonth}, totalizando ${brl(total)}.\n\nAo excluir o cartão, todas essas parcelas serão permanentemente removidas.\n\nEsta ação não pode ser desfeita.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir cartão e parcelas', style: 'destructive',
            onPress: async () => {
              await deleteCardWithCascade(userId, card.id, endISO)
              loadCards()
            },
          },
        ]
      )
    } else {
      Alert.alert(
        'Excluir cartão',
        `Tem certeza que deseja excluir o cartão "${card.name}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir', style: 'destructive',
            onPress: async () => {
              await deleteCardWithCascade(userId, card.id, endISO)
              loadCards()
            },
          },
        ]
      )
    }
  }

  const doSave = async (
    userId: string,
    closing: number,
    due: number,
    original: CreditCard | undefined,
    cycleEndISO: string | null
  ) => {
    const payload = {
      user_id: userId,
      name: form.name.trim(),
      last_four: form.lastFour.trim() || null,
      closing_day: closing,
      due_day: due,
      credit_limit: centsToFloat(form.limitDigits) > 0 ? centsToFloat(form.limitDigits) : null,
      brand: form.brand || 'generic',
    }
    setLoading(true)
    try {
      if (editingId) {
        await supabase.from('credit_cards').update(payload).eq('id', editingId)
        if (cycleEndISO && original) {
          const updatedCard = { ...original, closing_day: closing, due_day: due }
          const count = await recalculateFutureInstallments(editingId, updatedCard as any, cycleEndISO)
          if (count > 0) {
            Alert.alert('Datas atualizadas', `${count} lançamento(s) futuro(s) reagendados para o novo vencimento.`)
          }
        }
      } else {
        await supabase.from('credit_cards').insert(payload)
      }
      setShowForm(false)
      loadCards()
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Informe o nome do cartão.'); return }
    const closing = Number(form.closingDay)
    const due = Number(form.dueDay)
    if (!closing || closing < 1 || closing > 31) { setError('Dia de fechamento inválido (1-31).'); return }
    if (!due || due < 1 || due > 31) { setError('Dia de vencimento inválido (1-31).'); return }

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return
    setError(null)

    if (editingId) {
      const original = cards.find(c => c.id === editingId)
      const datesChanged = original && (original.closing_day !== closing || original.due_day !== due)

      if (datesChanged) {
        const cycleStart = useAuthStore.getState().user?.cycle_start ?? 1
        const { endISO, monthYear } = getCycle(cycleStart, 0)
        const updatedCard = { ...original!, closing_day: closing, due_day: due }

        setLoading(true)
        const { total, movingToCurrent } = await analyzeRecalculation(editingId, updatedCard as any, endISO)
        setLoading(false)

        if (movingToCurrent > 0) {
          Alert.alert(
            '⚠️ Parcelas antecipadas',
            `${movingToCurrent} parcela(s) futura(s) serão trazidas para o ciclo de ${monthYear} devido à mudança no fechamento.\n\nElas aparecerão imediatamente na tela Mensal.\n\nDeseja continuar?`,
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Confirmar', onPress: () => doSave(userId, closing, due, original, endISO) },
            ]
          )
          return
        }

        doSave(userId, closing, due, original, total > 0 ? endISO : null)
        return
      }
    }

    doSave(userId, closing, due, undefined, null)
  }

  // ── Brand picker modal ───────────────────────────────────────────────────
  if (showPicker) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={() => setShowPicker(false)}>
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Text style={{ color: '#fff', fontSize: 16 }}>← Voltar</Text>
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Aparência do cartão</Text>
            <View style={{ width: 80 }} />
          </View>
          <View style={styles.pickerBody}>
            <CardBrandPicker
              value={form.brand}
              onChange={brand => {
                setForm(f => ({ ...f, brand }))
                setShowPicker(false)
              }}
            />
          </View>
        </View>
      </Modal>
    )
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
            <Text style={styles.headerTitle}>
              {showForm ? (editingId ? 'Editar cartão' : 'Novo cartão') : 'Meus cartões'}
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
              <Text style={styles.label}>Nome do cartão</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={t => setForm(f => ({ ...f, name: t }))}
                placeholder="Ex: Nubank, Itaú Visa…"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.label}>Últimos 4 dígitos <Text style={styles.optional}>(opcional)</Text></Text>
              <TextInput
                style={styles.input}
                value={form.lastFour}
                onChangeText={t => setForm(f => ({ ...f, lastFour: t.replace(/\D/g, '').slice(0, 4) }))}
                keyboardType="numeric"
                placeholder="1234"
                placeholderTextColor={Colors.textMuted}
                maxLength={4}
              />

              <Text style={styles.label}>Aparência do cartão</Text>
              <TouchableOpacity style={styles.brandRow} onPress={() => setShowPicker(true)} activeOpacity={0.7}>
                <Image
                  source={getCardImage(form.brand)}
                  style={styles.brandPreview}
                  resizeMode="contain"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.brandHint}>Toque para selecionar</Text>
                </View>
                <Text style={{ fontSize: 16, color: Colors.textMuted }}>›</Text>
              </TouchableOpacity>

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Dia fechamento</Text>
                  <TextInput
                    style={styles.input}
                    value={form.closingDay}
                    onChangeText={t => setForm(f => ({ ...f, closingDay: t.replace(/\D/g, '').slice(0, 2) }))}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Dia vencimento</Text>
                  <TextInput
                    style={styles.input}
                    value={form.dueDay}
                    onChangeText={t => setForm(f => ({ ...f, dueDay: t.replace(/\D/g, '').slice(0, 2) }))}
                    keyboardType="numeric"
                    placeholder="20"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>

              <Text style={styles.label}>Limite do cartão <Text style={styles.optional}>(opcional)</Text></Text>
              <TextInput
                style={styles.input}
                value={formatCents(form.limitDigits)}
                onChangeText={t => setForm(f => ({ ...f, limitDigits: digitsOnly(t) }))}
                keyboardType="numeric"
                placeholder="R$ 0,00"
                placeholderTextColor={Colors.textMuted}
              />

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
                  : <Text style={styles.saveBtnText}>{editingId ? 'Salvar alterações' : 'Adicionar cartão'}</Text>
                }
              </TouchableOpacity>
              <View style={{ height: 8 }} />
            </ScrollView>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {fetching ? (
                <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
              ) : cards.length === 0 ? (
                <Text style={styles.empty}>Nenhum cartão cadastrado.</Text>
              ) : (
                cards.map(card => (
                  <View key={card.id} style={styles.cardRow}>
                    <View style={styles.cardIcon}>
                      <Image
                        source={getCardImage(card.brand)}
                        style={{ width: 56, height: 36 }}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>
                        {card.name}{card.last_four ? ` ••${card.last_four}` : ''}
                      </Text>
                      <Text style={styles.cardMeta}>
                        Fecha dia {card.closing_day} · Vence dia {card.due_day}
                        {card.credit_limit ? ` · Limite ${card.credit_limit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => openEdit(card)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}>
                      <Text style={styles.editBtn}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(card)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                      <Text style={styles.deleteBtn}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
                <Text style={styles.addBtnText}>+ Adicionar cartão</Text>
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
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '85%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textDark },
  closeIcon: { fontSize: 15, color: Colors.textMuted, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6, marginTop: 8 },
  optional: { fontWeight: '400', color: Colors.textMuted },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textDark, marginBottom: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  brandPreview: { width: 80, height: 50 },
  brandHint: { fontSize: 14, color: Colors.textMuted },
  twoCol: { flexDirection: 'row', gap: 12 },
  empty: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 24, marginBottom: 8 },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cardIcon: { width: 60, height: 40, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  cardMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  editBtn: { fontSize: 18, padding: 4 },
  deleteBtn: { fontSize: 18, padding: 4 },
  addBtn: {
    backgroundColor: Colors.lightBlue, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 16,
    borderWidth: 1.5, borderColor: Colors.primary + '40', borderStyle: 'dashed',
  },
  addBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  errorBox: {
    backgroundColor: Colors.lightRed, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 8,
  },
  errorText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pickerContainer: { flex: 1, backgroundColor: Colors.background },
  pickerHeader: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
})
