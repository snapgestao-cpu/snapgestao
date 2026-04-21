import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, TextInput, Alert, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Colors } from '../constants/colors'
import {
  captureReceipt, pickReceiptFromGallery, processReceipt,
} from '../lib/ocr'
import type { NFCeResult } from '../lib/ocr'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import { getCycle } from '../lib/cycle'
import { getPotIcon } from '../lib/potIcons'
import { BadgeToast } from '../components/BadgeToast'
import { checkAndGrantBadges, Badge } from '../lib/badges'
import { Pot } from '../types'
import QRCameraScanner from '../components/QRCameraScanner'
import NFCeWebView from '../components/NFCeWebView'

type OCRStep = 'menu' | 'qr_camera' | 'ocr_camera' | 'processing' | 'review' | 'saving'

type ReviewItem = { name: string; value: number; potId: string | null }

export default function OCRScreen() {
  const { user } = useAuthStore()
  const { cycleDate, defaultPotId, defaultPotName } = useLocalSearchParams<{
    cycleDate?: string
    defaultPotId?: string
    defaultPotName?: string
  }>()

  const initialDate = cycleDate ?? new Date().toISOString().split('T')[0]

  const [step, setStep] = useState<OCRStep>('menu')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [merchant, setMerchant] = useState('')
  const [total, setTotal] = useState('')
  const [receiptDate, setReceiptDate] = useState(initialDate)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [pots, setPots] = useState<Pot[]>([])
  const [simplified, setSimplified] = useState(false)
  const [singlePotId, setSinglePotId] = useState<string | null>(defaultPotId ?? null)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])
  const [processingMessage, setProcessingMessage] = useState('Lendo o cupom...')
  const [nfceUrl, setNfceUrl] = useState<string | null>(null)

  const loadPots = async () => {
    if (!user) return
    const cycle = getCycle(user.cycle_start ?? 1, 0)
    const { data } = await supabase
      .from('pots').select('*')
      .eq('user_id', user.id).eq('is_emergency', false)
      .lte('created_at', cycle.end.toISOString()).order('created_at')
    setPots((data ?? []) as Pot[])
  }

  // Auto-launch camera when step becomes 'ocr_camera' (e.g. after QR failure)
  useEffect(() => {
    if (step !== 'ocr_camera') return
    captureReceipt().then(uri => {
      if (uri) handleOCRCapture(uri)
      else setStep('menu')
    })
  }, [step])

  // OCR path: photograph → Google Vision
  const handleOCRCapture = async (uri: string | null) => {
    if (!uri || !user) return
    setImageUri(uri)
    setProcessingMessage('Lendo o cupom...')
    setStep('processing')
    await loadPots()

    let result
    try {
      result = await processReceipt(uri, user.id)
    } catch {
      Alert.alert('Erro de conexão', 'Verifique sua conexão e tente novamente.')
      setStep('menu')
      return
    }

    if (!result.success) {
      Alert.alert(
        'Erro no processamento',
        result.error?.includes('500') || result.error?.includes('non-2xx')
          ? 'Serviço de leitura indisponível. Tente novamente em instantes.'
          : (result.error ?? 'Não foi possível ler o cupom. Verifique a iluminação e tente novamente.'),
      )
      setStep('menu')
      return
    }

    setReceiptId(result.receipt_id ?? null)
    setMerchant(result.merchant ?? '')
    setTotal(result.total != null ? String(result.total) : '')
    setReceiptDate(result.receipt_date ?? initialDate)
    setItems((result.items ?? []).map(i => ({ name: i.name, value: i.value, potId: defaultPotId ?? null })))
    setStep('review')
  }

  // QR Code path: open SEFAZ URL in WebView → inject JS extractor
  const handleQRCodeScanned = async (url: string) => {
    await loadPots()
    setNfceUrl(url)
    setStep('processing')
  }

  const handleNFCeSuccess = (result: NFCeResult) => {
    setNfceUrl(null)
    setMerchant(result.merchant ?? '')
    setTotal(result.total != null ? String(result.total) : '')
    setReceiptDate(result.emission_date ?? initialDate)
    setItems((result.items ?? []).map(item => ({
      name: item.name,
      value: item.totalValue,
      potId: defaultPotId ?? null,
    })))
    setImageUri(null)
    setReceiptId(null)
    setStep('review')
  }

  const handleNFCeError = (msg: string) => {
    setNfceUrl(null)
    Alert.alert(
      'Não foi possível ler o cupom',
      msg,
      [
        { text: 'Tentar OCR', onPress: () => setStep('ocr_camera') },
        { text: 'Cancelar', onPress: () => setStep('menu') },
      ]
    )
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
            user_id: userId, pot_id: singlePotId,
            type: 'expense', amount: totalAmount,
            description: merchant || 'Cupom fiscal',
            merchant: merchant || null,
            date: today, payment_method: 'cash', is_need: true,
          })
        }
      } else {
        const validItems = items.filter(i => i.value > 0)
        for (const item of validItems) {
          await supabase.from('transactions').insert({
            user_id: userId, pot_id: item.potId,
            type: 'expense', amount: item.value,
            description: item.name,
            merchant: merchant || null,
            date: today, payment_method: 'cash', is_need: true,
          })
        }
      }

      if (receiptId) {
        await supabase.from('receipts').update({ processed: true }).eq('id', receiptId)
      }

      checkAndGrantBadges(userId, user.cycle_start ?? 1).then(b => { if (b.length > 0) setPendingBadges(b) })

      const count = simplified ? 1 : items.filter(i => i.value > 0).length
      Alert.alert('Sucesso', `${count} lançamento${count !== 1 ? 's' : ''} registrado${count !== 1 ? 's' : ''}!`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)/monthly') },
      ])
    } catch {
      Alert.alert('Erro', 'Falha ao salvar lançamentos.')
      setStep('review')
    }
  }

  const updateItemPot = (index: number, potId: string | null) =>
    setItems(prev => prev.map((item, i) => i === index ? { ...item, potId } : item))

  const removeItem = (index: number) =>
    setItems(prev => prev.filter((_, i) => i !== index))

  const addItem = () =>
    setItems(prev => [...prev, { name: '', value: 0, potId: null }])

  const updateItem = (index: number, field: 'name' | 'value', value: string) =>
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: field === 'value' ? parseFloat(value) || 0 : value } : item
    ))

  // ── STEP: menu ────────────────────────────────────────────────────────────
  if (step === 'menu') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.backBtn}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Adicionar cupom</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.menuContainer}>
          {defaultPotName ? (
            <View style={styles.potBadge}>
              <Text style={styles.potBadgeText}>📌 Pote: {defaultPotName}</Text>
            </View>
          ) : null}

          {/* QR Code — recomendado */}
          <TouchableOpacity
            style={styles.menuOptionPrimary}
            onPress={() => setStep('qr_camera')}
            activeOpacity={0.85}
          >
            <Text style={styles.menuOptionIcon}>📷</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuOptionTitlePrimary}>Cupom fiscal (QR Code)</Text>
              <Text style={styles.menuOptionDescPrimary}>
                Aponte para o QR Code do cupom. Dados buscados direto da SEFAZ — mais preciso.
              </Text>
            </View>
          </TouchableOpacity>

          {/* OCR — alternativa */}
          <TouchableOpacity
            style={styles.menuOptionSecondary}
            activeOpacity={0.85}
            onPress={async () => {
              const uri = await captureReceipt()
              if (uri) handleOCRCapture(uri)
            }}
          >
            <Text style={styles.menuOptionIcon}>🔍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuOptionTitleSecondary}>Ler texto do cupom (OCR)</Text>
              <Text style={styles.menuOptionDescSecondary}>
                Fotografa e lê o texto. Funciona para recibos sem QR Code.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuOptionSecondary}
            activeOpacity={0.85}
            onPress={async () => {
              const uri = await pickReceiptFromGallery()
              if (uri) handleOCRCapture(uri)
            }}
          >
            <Text style={styles.menuOptionIcon}>🖼️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuOptionTitleSecondary}>Escolher da galeria</Text>
              <Text style={styles.menuOptionDescSecondary}>
                Selecione uma foto já tirada do cupom.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.cancelLink}>
            <Text style={styles.cancelLinkText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP: qr_camera ───────────────────────────────────────────────────────
  if (step === 'qr_camera') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <QRCameraScanner
          onQRCodeScanned={handleQRCodeScanned}
          onCancel={() => setStep('menu')}
        />
      </SafeAreaView>
    )
  }

  // ── STEP: processing ──────────────────────────────────────────────────────
  if (step === 'processing') {
    // QR Code path: render WebView to load SEFAZ page and extract data via JS
    if (nfceUrl) {
      return (
        <NFCeWebView
          url={nfceUrl}
          onSuccess={handleNFCeSuccess}
          onError={handleNFCeError}
          onCancel={() => { setNfceUrl(null); setStep('menu') }}
        />
      )
    }
    // OCR path: spinner while Google Vision processes
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.processingStep}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.processingTitle}>{processingMessage}</Text>
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
        <TouchableOpacity onPress={() => setStep('menu')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backBtn}>‹ Novo</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Revisar cupom</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.reviewScroll} showsVerticalScrollIndicator={false}>

        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.thumbnail} resizeMode="cover" />
        )}

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

        <TouchableOpacity style={styles.toggleRow} onPress={() => setSimplified(v => !v)}>
          <Text style={styles.toggleLabel}>
            {simplified ? '✅' : '⬜'} Modo simplificado (total + pote único)
          </Text>
        </TouchableOpacity>

        {simplified ? (
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

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmBtn} onPress={handleSave}>
          <Text style={styles.confirmBtnText}>Confirmar lançamentos</Text>
        </TouchableOpacity>
      </View>
      {pendingBadges.length > 0 && (
        <BadgeToast badges={pendingBadges} onDone={() => setPendingBadges([])} />
      )}
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

  // Menu step
  menuContainer: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' },
  potBadge: {
    backgroundColor: Colors.lightBlue, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'center', marginBottom: 4,
  },
  potBadgeText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  menuOptionPrimary: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  menuOptionSecondary: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  menuOptionIcon: { fontSize: 32 },
  menuOptionTitlePrimary: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  menuOptionDescPrimary: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },
  menuOptionTitleSecondary: { color: Colors.textDark, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  menuOptionDescSecondary: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  cancelLink: { alignItems: 'center', paddingVertical: 8 },
  cancelLinkText: { color: Colors.textMuted, fontSize: 14 },

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
