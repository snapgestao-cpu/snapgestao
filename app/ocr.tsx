import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, TextInput, Alert, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'
import { captureReceipt, pickReceiptFromGallery, processReceipt, OCRItem } from '../lib/ocr'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import { getCycle } from '../lib/cycle'
import { getPotIcon } from '../lib/potIcons'
import { Pot } from '../types'

type OCRStep = 'camera' | 'processing' | 'review' | 'saving'

type ReviewItem = OCRItem & { potId: string | null }

export default function OCRScreen() {
  const { user } = useAuthStore()

  const [step, setStep] = useState<OCRStep>('camera')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [merchant, setMerchant] = useState('')
  const [total, setTotal] = useState('')
  const [receiptDate, setReceiptDate] = useState('')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [pots, setPots] = useState<Pot[]>([])
  const [simplified, setSimplified] = useState(false)
  const [singlePotId, setSinglePotId] = useState<string | null>(null)

  const loadPots = async () => {
    if (!user) return
    const cycle = getCycle(user.cycle_start ?? 1, 0)
    const { data } = await supabase
      .from('pots')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_emergency', false)
      .is('deleted_at', null)
      .lte('created_at', cycle.end.toISOString())
      .order('created_at')
    setPots((data ?? []) as Pot[])
  }

  const handleCapture = async (uri: string | null) => {
    if (!uri || !user) return
    setImageUri(uri)
    setStep('processing')
    await loadPots()

    const result = await processReceipt(uri, user.id)

    if (!result.success) {
      Alert.alert('Erro', result.error ?? 'Falha ao processar cupom.')
      setStep('camera')
      return
    }

    setReceiptId(result.receipt_id ?? null)
    setMerchant(result.merchant ?? '')
    setTotal(result.total != null ? String(result.total) : '')
    setReceiptDate(result.receipt_date ?? new Date().toISOString().split('T')[0])
    setItems(
      (result.items ?? []).map(i => ({ ...i, potId: null })),
    )
    setStep('review')
  }

  const handleSave = async () => {
    if (!user) return
    setStep('saving')

    const userId = user.id
    const today = receiptDate || new Date().toISOString().split('T')[0]
    const totalAmount = parseFloat(total) || 0

    try {
      if (simplified) {
        if (totalAmount > 0) {
          await supabase.from('transactions').insert({
            user_id: userId,
            pot_id: singlePotId,
            type: 'expense',
            amount: totalAmount,
            description: merchant || 'Cupom fiscal',
            merchant: merchant || null,
            date: today,
            payment_method: 'cash',
            is_need: true,
          })
        }
      } else {
        const validItems = items.filter(i => i.value > 0)
        for (const item of validItems) {
          await supabase.from('transactions').insert({
            user_id: userId,
            pot_id: item.potId,
            type: 'expense',
            amount: item.value,
            description: item.name,
            merchant: merchant || null,
            date: today,
            payment_method: 'cash',
            is_need: true,
          })
        }
      }

      if (receiptId) {
        await supabase.from('receipts').update({ processed: true }).eq('id', receiptId)
      }

      const count = simplified ? 1 : items.filter(i => i.value > 0).length
      Alert.alert('Sucesso', `${count} lançamento${count !== 1 ? 's' : ''} registrado${count !== 1 ? 's' : ''}!`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)/monthly') },
      ])
    } catch {
      Alert.alert('Erro', 'Falha ao salvar lançamentos.')
      setStep('review')
    }
  }

  const updateItemPot = (index: number, potId: string | null) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, potId } : item))
  }

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const addItem = () => {
    setItems(prev => [...prev, { name: '', value: 0, potId: null }])
  }

  const updateItem = (index: number, field: 'name' | 'value', value: string) => {
    setItems(prev => prev.map((item, i) =>
      i === index
        ? { ...item, [field]: field === 'value' ? parseFloat(value) || 0 : value }
        : item,
    ))
  }

  // ── STEP: camera ──────────────────────────────────────────────────────────
  if (step === 'camera') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.backBtn}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Escanear cupom</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.cameraStep}>
          <Text style={styles.cameraIcon}>🧾</Text>
          <Text style={styles.cameraTitle}>Fotografar cupom fiscal</Text>
          <Text style={styles.cameraHint}>Posicione o cupom em boa iluminação e enquadre o texto completamente.</Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={async () => handleCapture(await captureReceipt())}>
            <Text style={styles.primaryBtnText}>📷 Fotografar cupom</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={async () => handleCapture(await pickReceiptFromGallery())}>
            <Text style={styles.secondaryBtnText}>🖼️ Escolher da galeria</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP: processing ──────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.processingStep}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.processingTitle}>Lendo o cupom...</Text>
          <Text style={styles.processingHint}>Isso pode levar alguns segundos</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP: saving ─────────────────────────────────────────────────────────
  if (step === 'saving') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.processingStep}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.processingTitle}>Salvando lançamentos...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP: review ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('camera')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backBtn}>‹ Novo</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Revisar cupom</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.reviewScroll} showsVerticalScrollIndicator={false}>

        {/* Miniatura */}
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.thumbnail} resizeMode="cover" />
        )}

        {/* Dados do cupom */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Estabelecimento</Text>
          <TextInput
            style={styles.fieldInput}
            value={merchant}
            onChangeText={setMerchant}
            placeholder="Nome do estabelecimento"
            placeholderTextColor={Colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Total (R$)</Text>
          <TextInput
            style={styles.fieldInput}
            value={total}
            onChangeText={setTotal}
            keyboardType="decimal-pad"
            placeholder="0,00"
            placeholderTextColor={Colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Data</Text>
          <TextInput
            style={styles.fieldInput}
            value={receiptDate}
            onChangeText={setReceiptDate}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Toggle modo */}
        <TouchableOpacity style={styles.toggleRow} onPress={() => setSimplified(v => !v)}>
          <Text style={styles.toggleLabel}>
            {simplified ? '✅' : '⬜'} Modo simplificado (total + pote único)
          </Text>
        </TouchableOpacity>

        {simplified ? (
          /* Modo simplificado — escolher 1 pote */
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Pote</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.potChip, singlePotId === null && styles.potChipActive]}
                onPress={() => setSinglePotId(null)}
              >
                <Text style={[styles.potChipText, singlePotId === null && styles.potChipTextActive]}>Sem pote</Text>
              </TouchableOpacity>
              {pots.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.potChip, singlePotId === p.id && styles.potChipActive]}
                  onPress={() => setSinglePotId(p.id)}
                >
                  <Text style={[styles.potChipText, singlePotId === p.id && styles.potChipTextActive]}>
                    {getPotIcon(p.name)} {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : (
          /* Modo detalhado — item a item */
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Itens detectados</Text>

            {items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <View style={styles.itemFields}>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1, marginBottom: 4 }]}
                    value={item.name}
                    onChangeText={v => updateItem(index, 'name', v)}
                    placeholder="Descrição"
                    placeholderTextColor={Colors.textMuted}
                  />
                  <View style={styles.itemBottom}>
                    <TextInput
                      style={[styles.fieldInput, { width: 90 }]}
                      value={item.value > 0 ? String(item.value) : ''}
                      onChangeText={v => updateItem(index, 'value', v)}
                      keyboardType="decimal-pad"
                      placeholder="R$"
                      placeholderTextColor={Colors.textMuted}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                      <TouchableOpacity
                        style={[styles.potChipSm, item.potId === null && styles.potChipActive]}
                        onPress={() => updateItemPot(index, null)}
                      >
                        <Text style={[styles.potChipText, item.potId === null && styles.potChipTextActive]}>—</Text>
                      </TouchableOpacity>
                      {pots.map(p => (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.potChipSm, item.potId === p.id && styles.potChipActive]}
                          onPress={() => updateItemPot(index, p.id)}
                        >
                          <Text style={[styles.potChipText, item.potId === p.id && styles.potChipTextActive]}>
                            {getPotIcon(p.name)} {p.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeItem(index)}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
              <Text style={styles.addItemBtnText}>+ Adicionar item</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmBtn} onPress={handleSave}>
          <Text style={styles.confirmBtnText}>Confirmar lançamentos</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { fontSize: 16, color: Colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textDark },

  // Camera step
  cameraStep: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  cameraIcon: { fontSize: 64 },
  cameraTitle: { fontSize: 20, fontWeight: '800', color: Colors.textDark, textAlign: 'center' },
  cameraHint: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 32, paddingVertical: 16, width: '100%', alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 32, paddingVertical: 14, width: '100%', alignItems: 'center',
  },
  secondaryBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '600' },

  // Processing / saving step
  processingStep: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  processingTitle: { fontSize: 18, fontWeight: '700', color: Colors.textDark },
  processingHint: { fontSize: 14, color: Colors.textMuted },

  // Review step
  reviewScroll: { padding: 16 },
  thumbnail: { width: '100%', height: 180, borderRadius: 12, marginBottom: 16 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 4, marginTop: 8 },
  fieldInput: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: Colors.textDark,
  },
  toggleRow: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    marginBottom: 12, flexDirection: 'row', alignItems: 'center',
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textDark, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  itemFields: { flex: 1 },
  itemBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeBtn: { padding: 8, marginTop: 4 },
  removeBtnText: { fontSize: 16, color: Colors.textMuted },
  potChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
    marginRight: 6,
  },
  potChipSm: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
    marginRight: 6,
  },
  potChipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  potChipText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  potChipTextActive: { color: Colors.primary },
  addItemBtn: {
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  addItemBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 10,
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  cancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textMuted },
  confirmBtn: {
    flex: 2, backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
