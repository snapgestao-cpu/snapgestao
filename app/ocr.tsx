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
import NFCeWebView, { sanitizeNFCeUrl } from '../components/NFCeWebView'
import {
  extractStateCode, getStateByCode, isStateSupported, STATE_NAMES,
} from '../lib/nfce-states'
import type { NFCeState } from '../lib/nfce-states'

type OCRStep = 'menu' | 'qr_camera' | 'ocr_camera' | 'processing' | 'review' | 'saving'

type ReviewItem = {
  id: string
  name: string
  valueCents: number
  quantity: number
  unit: string
  potId: string | null
}

const PAYMENT_OPTIONS = [
  { key: 'debit',    label: 'Débito'    },
  { key: 'credit',   label: 'Crédito'   },
  { key: 'pix',      label: 'Pix'       },
  { key: 'cash',     label: 'Dinheiro'  },
  { key: 'transfer', label: 'Transfer.' },
]

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function digitsOnly(str: string): string {
  return str.replace(/\D/g, '')
}

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
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [pots, setPots] = useState<Pot[]>([])
  const [simplified, setSimplified] = useState(false)
  const [singlePotId, setSinglePotId] = useState<string | null>(defaultPotId ?? null)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])
  const [processingMessage, setProcessingMessage] = useState('Lendo o cupom...')
  const [nfceUrl, setNfceUrl] = useState<string | null>(null)
  const [nfceState, setNfceState] = useState<NFCeState | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<string>('debit')
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [globalPotId, setGlobalPotId] = useState<string | null>(null)
  const [globalPotName, setGlobalPotName] = useState<string>('')

  const loadPots = async () => {
    if (!user) return
    const cycle = getCycle(user.cycle_start ?? 1, 0)
    const { data } = await supabase
      .from('pots').select('*')
      .eq('user_id', user.id).eq('is_emergency', false)
      .lte('created_at', cycle.end.toISOString()).order('created_at')
    setPots((data ?? []) as Pot[])
  }

  // Auto-launch camera when step becomes 'ocr_camera'
  useEffect(() => {
    if (step !== 'ocr_camera') return
    captureReceipt().then(uri => {
      if (uri) handleOCRCapture(uri)
      else setStep('menu')
    })
  }, [step])

  // Aplicar pote global em todos os itens quando selecionado
  useEffect(() => {
    if (globalPotId) {
      setReviewItems(prev => prev.map(item => ({ ...item, potId: globalPotId })))
    }
  }, [globalPotId])

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
    setPaymentMethod('debit')
    setReviewItems((result.items ?? []).map((item, i) => ({
      id: String(i),
      name: item.name,
      valueCents: Math.round(item.value * 100),
      quantity: 1,
      unit: 'UN',
      potId: defaultPotId ?? null,
    })))
    setStep('review')
  }

  // QR Code path: detect state → sanitize URL → WebView
  const handleQRCodeScanned = async (rawUrl: string) => {
    const stateCode = extractStateCode(rawUrl)
    const state = getStateByCode(stateCode)

    console.log('[QR] Estado detectado:', stateCode, STATE_NAMES[stateCode ?? ''] ?? 'Desconhecido')
    console.log('[QR] Suportado:', isStateSupported(stateCode))

    if (!isStateSupported(stateCode)) {
      const stateName = stateCode
        ? (STATE_NAMES[stateCode] ?? `Estado ${stateCode}`)
        : 'Estado não identificado'
      Alert.alert(
        'Estado não suportado ainda',
        `O cupom é de ${stateName}.\n\nAtualmente suportamos:\n• Rio de Janeiro (RJ)\n• São Paulo (SP)\n• Minas Gerais (MG)\n\nUse a opção OCR para ler o texto do cupom.`,
        [
          { text: 'Tentar OCR', onPress: () => setStep('ocr_camera') },
          { text: 'Cancelar', onPress: () => setStep('menu') },
        ]
      )
      return
    }

    await loadPots()
    setNfceUrl(sanitizeNFCeUrl(rawUrl))
    setNfceState(state)
    setStep('processing')
  }

  const handleNFCeSuccess = (result: NFCeResult) => {
    setNfceUrl(null)
    setNfceState(null)
    setMerchant(result.merchant ?? '')
    setTotal(result.total != null ? String(result.total) : '')
    setReceiptDate(result.emission_date ?? initialDate)
    setPaymentMethod(result.payment_method ?? 'debit')
    setReviewItems((result.items ?? []).map((item, i) => ({
      id: String(i),
      name: item.name,
      valueCents: Math.round(item.totalValue * 100),
      quantity: item.quantity,
      unit: item.unit,
      potId: defaultPotId ?? null,
    })))
    setImageUri(null)
    setReceiptId(null)
    setStep('review')
  }

  const handleNFCeError = (msg: string) => {
    setNfceUrl(null)
    setNfceState(null)
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
            date: today, payment_method: paymentMethod, is_need: true,
          })
        }
      } else {
        const validItems = reviewItems.filter(i => i.valueCents > 0)
        for (const item of validItems) {
          await supabase.from('transactions').insert({
            user_id: userId, pot_id: item.potId,
            type: 'expense', amount: item.valueCents / 100,
            description: item.name,
            merchant: merchant || null,
            date: today, payment_method: paymentMethod, is_need: true,
          })
        }
      }

      if (receiptId) {
        await supabase.from('receipts').update({ processed: true }).eq('id', receiptId)
      }

      checkAndGrantBadges(userId, user.cycle_start ?? 1).then(b => { if (b.length > 0) setPendingBadges(b) })

      const count = simplified ? 1 : reviewItems.filter(i => i.valueCents > 0).length
      Alert.alert('Sucesso', `${count} lançamento${count !== 1 ? 's' : ''} registrado${count !== 1 ? 's' : ''}!`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)/monthly') },
      ])
    } catch {
      Alert.alert('Erro', 'Falha ao salvar lançamentos.')
      setStep('review')
    }
  }

  const updateItem = (id: string, changes: Partial<ReviewItem>) =>
    setReviewItems(prev => prev.map(item => item.id === id ? { ...item, ...changes } : item))

  const removeItem = (id: string) =>
    setReviewItems(prev => prev.filter(item => item.id !== id))

  const addItem = () =>
    setReviewItems(prev => [...prev, {
      id: String(Date.now()),
      name: '', valueCents: 0, quantity: 1, unit: 'UN', potId: null,
    }])

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

          <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: -6 }}>
            Suporta cupons de RJ, SP e MG
          </Text>

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
    if (nfceUrl) {
      return (
        <NFCeWebView
          url={nfceUrl}
          state={nfceState}
          onSuccess={handleNFCeSuccess}
          onError={handleNFCeError}
          onCancel={() => { setNfceUrl(null); setNfceState(null); setStep('menu') }}
        />
      )
    }
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

        {/* Merchant / total / date */}
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

        {/* Payment method selector */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Forma de pagamento</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PAYMENT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setPaymentMethod(opt.key)}
                style={[
                  styles.payChip,
                  paymentMethod === opt.key && styles.payChipActive,
                ]}
              >
                <Text style={[
                  styles.payChipText,
                  paymentMethod === opt.key && styles.payChipTextActive,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.payHint}>Detectado automaticamente — toque para alterar</Text>
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
          <>
          {/* Seletor de pote global */}
          <View style={{
            backgroundColor: Colors.white, borderRadius: 14, padding: 16, marginBottom: 12,
            borderWidth: 1.5, borderColor: Colors.primary,
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 16 }}>🫙</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textDark }}>
                Aplicar pote para todos os itens
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 10 }}>
              Selecione um pote para aplicar em todos os itens de uma vez. Você ainda pode alterar individualmente depois.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                onPress={() => { setGlobalPotId(null); setGlobalPotName('') }}
                style={{
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                  borderWidth: 1.5,
                  borderColor: !globalPotId ? Colors.primary : Colors.border,
                  backgroundColor: !globalPotId ? Colors.lightBlue : Colors.white,
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: !globalPotId ? '700' : '400',
                  color: !globalPotId ? Colors.primary : Colors.textMuted,
                }}>Individual</Text>
              </TouchableOpacity>
              {pots.map(pot => (
                <TouchableOpacity
                  key={pot.id}
                  onPress={() => {
                    setGlobalPotId(pot.id)
                    setGlobalPotName(pot.name)
                    setReviewItems(prev => prev.map(item => ({ ...item, potId: pot.id })))
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                    borderWidth: 1.5,
                    borderColor: globalPotId === pot.id ? Colors.primary : Colors.border,
                    backgroundColor: globalPotId === pot.id ? Colors.lightBlue : Colors.white,
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pot.color }} />
                  <Text style={{
                    fontSize: 12,
                    fontWeight: globalPotId === pot.id ? '700' : '400',
                    color: globalPotId === pot.id ? Colors.primary : Colors.textDark,
                  }}>{pot.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {globalPotId && (
              <View style={{
                marginTop: 10, backgroundColor: Colors.lightBlue,
                borderRadius: 8, padding: 8,
                flexDirection: 'row', alignItems: 'center', gap: 6,
              }}>
                <Text style={{ fontSize: 12 }}>✅</Text>
                <Text style={{ fontSize: 12, color: Colors.primary, flex: 1 }}>
                  Todos os itens serão lançados em{' '}
                  <Text style={{ fontWeight: '700' }}>{globalPotName}</Text>
                  . Altere individualmente se precisar.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Itens detectados</Text>
            {reviewItems.map(item => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemFields}>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1, marginBottom: 4 }]}
                    value={item.name}
                    onChangeText={v => updateItem(item.id, { name: v })}
                    onFocus={() => setFocusedItemId(item.id)}
                    onBlur={() => setFocusedItemId(null)}
                    selection={focusedItemId !== item.id ? { start: 0, end: 0 } : undefined}
                    placeholder="Descrição"
                    placeholderTextColor={Colors.textMuted}
                  />
                  <View style={styles.itemBottom}>
                    <TextInput
                      style={styles.valueInput}
                      value={formatCents(item.valueCents)}
                      onChangeText={text => {
                        const cents = parseInt(digitsOnly(text) || '0', 10)
                        updateItem(item.id, { valueCents: cents })
                      }}
                      keyboardType="numeric"
                      placeholder="R$ 0,00"
                      placeholderTextColor={Colors.textMuted}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                      <TouchableOpacity
                        style={[styles.potChipSm, item.potId === null && styles.potChipActive]}
                        onPress={() => updateItem(item.id, { potId: null })}
                      >
                        <Text style={[styles.potChipText, item.potId === null && styles.potChipTextActive]}>—</Text>
                      </TouchableOpacity>
                      {pots.map(p => (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.potChipSm, item.potId === p.id && styles.potChipActive]}
                          onPress={() => updateItem(item.id, { potId: p.id })}
                        >
                          <Text style={[styles.potChipText, item.potId === p.id && styles.potChipTextActive]}>
                            {getPotIcon(p.name)} {p.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeItem(item.id)}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
              <Text style={styles.addItemBtnText}>+ Adicionar item</Text>
            </TouchableOpacity>
          </View>
          </>
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
  // Payment chips
  payChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  payChipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  payChipText: { fontSize: 13, fontWeight: '500', color: Colors.textMuted },
  payChipTextActive: { color: Colors.primary, fontWeight: '700' },
  payHint: { fontSize: 11, color: Colors.textMuted, marginTop: 10 },
  // Mode toggle
  toggleRow: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    marginBottom: 12, flexDirection: 'row', alignItems: 'center',
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textDark, marginBottom: 12 },
  // Item rows
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  itemFields: { flex: 1 },
  itemBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valueInput: {
    width: 90,
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 10,
    fontSize: 14, color: Colors.textDark, textAlign: 'right',
  },
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
