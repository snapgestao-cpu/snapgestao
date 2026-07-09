/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Tela de OCR — escaneia cupons fiscais por câmera ou galeria.
 * Suporta NFC-e via QR Code (WebView SEFAZ) e DANFe via imagem.
 * Detecta forma de pagamento, calcula billing_date para crédito
 * e oferece opt-in para a base colaborativa de preços.
 */

import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, TextInput, Alert, Image, Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Colors } from '../constants/colors'
// Google Vision — substituído pelo Gemini OCR (lib/ocr-gemini.ts)
// import { processReceipt } from '../lib/ocr'
import { captureReceipt, pickReceiptFromGallery } from '../lib/ocr'
import type { NFCeResult } from '../lib/ocr'
import { analyzeReceiptWithGemini, normalizeDate } from '../lib/ocr-gemini'
import * as DocumentPicker from 'expo-document-picker'
import { readAsStringAsync, getInfoAsync, EncodingType } from 'expo-file-system/legacy'
import { Image as CompressorImage } from 'react-native-compressor'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import { getCycle } from '../lib/cycle'
import { getPotIcon } from '../lib/potIcons'
import { BadgeToast } from '../components/BadgeToast'
import { checkAndGrantBadges, Badge } from '../lib/badges'
import { Pot, CreditCard, IRCategory, ReceiptDocumentType } from '../types'
import { IR_CATEGORY_LABELS } from '../lib/ir'
import QRCameraScanner from '../components/QRCameraScanner'
import NFCeWebView, { sanitizeNFCeUrl } from '../components/NFCeWebView'
import {
  extractStateCode, getStateByCode, isStateSupported, STATE_NAMES,
} from '../lib/nfce-states'
import type { NFCeState } from '../lib/nfce-states'
import {
  getUserPriceShareOptIn,
  setUserPriceShareOptIn,
  submitPriceData,
} from '../lib/price-database'
import PriceShareOptInModal from '../components/PriceShareOptInModal'
import { CreditCardModal } from '../components/CreditCardModal'
import IsNeedSelector from '../components/IsNeedSelector'

function extractChaveAcesso(url: string): string | null {
  try {
    const match = url.match(/[?&]p=([^&]+)/)
    if (!match) return null
    const decoded = decodeURIComponent(match[1])
    const chave = decoded.split('|')[0].replace(/\D/g, '')
    console.log('[Chave] Extraída:', chave)
    console.log('[Chave] Tamanho:', chave.length)
    if (chave.length >= 43) return chave
    return null
  } catch {
    return null
  }
}

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
  { key: 'debit',               label: 'Débito'    },
  { key: 'credit',              label: 'Crédito'   },
  { key: 'pix',                 label: 'Pix'       },
  { key: 'cash',                label: 'Dinheiro'  },
  { key: 'transfer',            label: 'Transfer.' },
  { key: 'voucher_alimentacao', label: '🍽️ Aliment.' },
  { key: 'voucher_refeicao',    label: '🍴 Refeição' },
]

const DOC_TYPE_CONFIG = {
  cupom_fiscal:       { icon: '🛒', label: 'Cupom Fiscal',             bg: '#E6F1FB', color: '#0F5EA8' },
  nota_servico:       { icon: '🧾', label: 'Nota de Serviço',          bg: '#EDE9F8', color: '#6B4BB5' },
  nota_compra:        { icon: '📄', label: 'Nota Fiscal de Produto',    bg: '#E6F1FB', color: '#0F5EA8' },
  comprovante_pix:    { icon: '🔄', label: 'Comprovante Pix',           bg: '#EAF3DE', color: '#1EB87A' },
  comprovante_ted:    { icon: '🔄', label: 'Comprovante TED/DOC',       bg: '#EAF3DE', color: '#1EB87A' },
  comprovante_cartao: { icon: '💳', label: 'Comprovante de Cartão',     bg: '#E6F1FB', color: '#0F5EA8' },
  recibo:             { icon: '📋', label: 'Recibo',                    bg: '#FAEEDA', color: '#BA7517' },
  fatura:             { icon: '📃', label: 'Fatura',                    bg: '#FAEEDA', color: '#BA7517' },
  desconhecido:       { icon: '❓', label: 'Documento não identificado', bg: '#F4F6F9', color: '#7A8499' },
}

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
  const [y, m, d] = txISO.split('-').map(Number)
  let month0 = m - 1 + offset + 1
  let year = y
  while (month0 > 11) { month0 -= 12; year += 1 }
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  return new Date(year, month0, Math.min(d, lastDay)).toISOString().split('T')[0]
}

function genUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function digitsOnly(str: string): string {
  return str.replace(/\D/g, '')
}

function sortReviewItemsByName(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })
  )
}

export default function OCRScreen() {
  const { user } = useAuthStore()
  const { cycleDate, defaultPotId, defaultPotName } = useLocalSearchParams<{
    cycleDate?: string
    defaultPotId?: string
    defaultPotName?: string
  }>()

  const initialDate = cycleDate ?? new Date().toISOString().split('T')[0] // YYYY-MM-DD (fallback/DB)
  const initialDisplayDate = normalizeDate(initialDate) ?? initialDate   // DD/MM/YYYY (exibição)

  const [step, setStep] = useState<OCRStep>('menu')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [merchant, setMerchant] = useState('')
  const [total, setTotal] = useState('')
  const [receiptDate, setReceiptDate] = useState(initialDisplayDate)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [pots, setPots] = useState<Pot[]>([])
  const [simplified, setSimplified] = useState(false)
  const [singlePotId, setSinglePotId] = useState<string | null>(defaultPotId ?? null)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])
  const [processingMessage, setProcessingMessage] = useState('Lendo o cupom...')
  const [nfceUrl, setNfceUrl] = useState<string | null>(null)
  const [nfceState, setNfceState] = useState<NFCeState | null>(null)
  const [nfceChave, setNfceChave] = useState<string | null>(null)
  const [nfceStateCode, setNfceStateCode] = useState<string>('33')
  const [paymentMethod, setPaymentMethod] = useState<string>('debit')
  const [isNeed, setIsNeed] = useState<boolean | null>(true)
  const [cards, setCards] = useState<CreditCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [isInstallment, setIsInstallment] = useState(false)
  const [installments, setInstallments] = useState(2)
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [globalPotId, setGlobalPotId] = useState<string | null>(defaultPotId ?? null)
  const [globalPotName, setGlobalPotName] = useState<string>(defaultPotName ?? '')

  // IR deduction
  const irModuleEnabled = user?.plan === 'premium'
  const [isIrDeductible, setIsIrDeductible] = useState(false)
  const [irCategory, setIrCategory] = useState<IRCategory>('saude')
  const [irProviderName, setIrProviderName] = useState('')
  const [irProviderDocument, setIrProviderDocument] = useState('')

  // Price database
  const [nfceMeta, setNfceMeta] = useState<{ cnpj: string | null } | null>(null)
  const [showOptInModal, setShowOptInModal] = useState(false)
  const [pendingPriceData, setPendingPriceData] = useState<{
    items: Array<{ name: string; totalValue: number; quantity: number }>
    merchant: string
    cnpj: string | null
    emission_date: string
  } | null>(null)

  const [showCreditCardModal, setShowCreditCardModal] = useState(false)

  // Gemini OCR extra state
  const [documentType, setDocumentType] = useState<ReceiptDocumentType>('desconhecido')
  const [ocrConfidence, setOcrConfidence] = useState(1)
  const [pixKey, setPixKey] = useState<string | null>(null)
  const [pixEndToEnd, setPixEndToEnd] = useState<string | null>(null)
  const [bankOrigin, setBankOrigin] = useState<string | null>(null)
  const [bankDestination, setBankDestination] = useState<string | null>(null)
  const [recipientName, setRecipientName] = useState<string | null>(null)
  const [serviceDescription, setServiceDescription] = useState<string | null>(null)
  const [competencePeriod, setCompetencePeriod] = useState<string | null>(null)

  useEffect(() => {
    if (paymentMethod !== 'credit') { setIsInstallment(false); return }
    if (!user) return
    supabase.from('credit_cards').select('*').eq('user_id', user.id)
      .then(({ data }) => {
        const list = (data as CreditCard[]) ?? []
        setCards(list)
        setSelectedCardId(list[0]?.id ?? null)
        if (list.length === 0) {
          Alert.alert(
            'Nenhum cartão cadastrado',
            'Você não tem cartões de crédito cadastrados. Cadastrar um cartão permite controlar os vencimentos das parcelas corretamente.',
            [
              { text: 'Cadastrar cartão', onPress: () => setShowCreditCardModal(true) },
              { text: 'Usar genérico', style: 'cancel' },
            ]
          )
        }
      })
  }, [paymentMethod])

  const loadPots = async () => {
    if (!user) return
    const cycle = getCycle(user.cycle_start ?? 1, 0)
    const { data } = await supabase
      .from('pots').select('*')
      .eq('user_id', user.id).eq('is_emergency', false)
      .lte('created_at', cycle.end.toISOString()).order('created_at')
    setPots((data ?? []) as Pot[])
  }

  // Aplicar pote global em todos os itens quando selecionado
  useEffect(() => {
    if (globalPotId) {
      setReviewItems(prev => prev.map(item => ({ ...item, potId: globalPotId })))
    }
  }, [globalPotId])

  function mapGeminiPayment(pm: string | null): string {
    switch (pm) {
      case 'dinheiro': return 'cash'
      case 'debito': return 'debit'
      case 'credito': return 'credit'
      case 'pix': return 'pix'
      case 'transferencia': return 'transfer'
      default: return 'debit'
    }
  }

  // OCR path: photograph/PDF → Gemini Vision
  const handleOCRCapture = async (uri: string | null, mode: 'image' | 'pdf' = 'image') => {
    if (!uri || !user) return
    setImageUri(mode === 'image' ? uri : null)
    setProcessingMessage(mode === 'pdf' ? 'Lendo PDF...' : 'Lendo documento...')
    setStep('processing')
    await loadPots()

    let result
    try {
      let base64: string
      let mimeType: 'image/jpeg' | 'application/pdf'

      if (mode === 'pdf') {
        const raw = await readAsStringAsync(uri, { encoding: EncodingType.Base64 })
        base64 = raw.replace(/^data:[^;]+;base64,/, '')
        mimeType = 'application/pdf'
        console.log('[Gemini PDF] base64 length:', base64.length, '| prefix:', base64.slice(0, 20))
      } else {
        try {
          const compressedUri = await CompressorImage.compress(uri, {
            maxWidth: 1200,
            quality: 0.8,
            input: 'uri',
            output: 'jpg',
            returnableOutputType: 'uri',
          })
          base64 = await readAsStringAsync(compressedUri, { encoding: EncodingType.Base64 })
          console.log('[OCR] compressão OK, base64 length:', base64.length)
        } catch (compressError) {
          console.warn('[OCR] compressor falhou, usando fallback fetch:', compressError)
          const resp = await fetch(uri)
          const blob = await resp.blob()
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
          console.log('[OCR] fallback base64 length:', base64.length)
        }
        mimeType = 'image/jpeg'
      }

      setProcessingMessage('Analisando com IA...')
      result = await analyzeReceiptWithGemini(base64, mimeType)
    } catch (err: any) {
      const msg: string = err?.message ?? String(err)
      console.error('[OCR] erro:', msg)
      Alert.alert(
        'Erro no OCR',
        `${msg}\n\nPreencha os dados manualmente.`,
        [{ text: 'OK' }]
      )
      setDocumentType('desconhecido')
      setOcrConfidence(0)
      setStep('review')
      return
    }

    setDocumentType(result.document_type)
    setOcrConfidence(result.confidence)
    setMerchant(result.merchant ?? '')
    setTotal(result.total != null ? String(result.total) : '')
    setReceiptDate(normalizeDate(result.date) ?? initialDisplayDate)
    setPaymentMethod(mapGeminiPayment(result.payment_method))
    setPixKey(result.pix_key)
    setPixEndToEnd(result.pix_end_to_end)
    setBankOrigin(result.bank_origin)
    setBankDestination(result.bank_destination)
    setRecipientName(result.recipient_name)
    setServiceDescription(result.service_description)
    setCompetencePeriod(result.competence_period)
    if (result.merchant) setIrProviderName(result.merchant)
    if (result.cnpj ?? result.cpf) setIrProviderDocument(result.cnpj ?? result.cpf ?? '')
    if (result.document_type === 'nota_servico' && irModuleEnabled) setIsIrDeductible(true)

    const forceSimplified = ['comprovante_pix', 'comprovante_ted', 'nota_servico', 'fatura', 'comprovante_cartao'].includes(result.document_type)
    setSimplified(forceSimplified || result.items.length === 0)

    setReviewItems(sortReviewItemsByName(result.items.map((item, i) => ({
      id: String(i),
      name: item.name,
      valueCents: Math.round((item.total ?? 0) * 100),
      quantity: item.qty ?? 1,
      unit: 'UN',
      potId: defaultPotId ?? null,
    }))))

    if (result.confidence < 0.5) {
      Alert.alert(
        'Leitura parcial',
        'Não foi possível ler o documento com clareza. Verifique os dados antes de salvar.',
        [{ text: 'Entendi' }]
      )
    }

    setStep('review')
  }

  const handlePhotoCapture = async () => {
    const uri = await captureReceipt()
    if (uri) await handleOCRCapture(uri, 'image')
  }

  const handleGalleryCapture = () => {
    Alert.alert(
      'Selecionar da galeria',
      'Escolha o tipo de arquivo',
      [
        {
          text: '🖼️  Imagem (JPG, PNG)',
          onPress: async () => {
            const uri = await pickReceiptFromGallery()
            if (uri) await handleOCRCapture(uri, 'image')
          },
        },
        {
          text: '📄  Documento (PDF)',
          onPress: handlePDFCapture,
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    )
  }

  const handlePDFCapture = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    console.log('[Gemini PDF] picked uri:', asset.uri)

    const fileInfo = await getInfoAsync(asset.uri)
    console.log('[Gemini PDF] file info:', JSON.stringify(fileInfo))

    if (fileInfo.exists && (fileInfo as any).size > 20 * 1024 * 1024) {
      Alert.alert('PDF muito grande', 'O arquivo deve ter menos de 20 MB. Tente um arquivo menor.')
      return
    }

    await handleOCRCapture(asset.uri, 'pdf')
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
        `O cupom é de ${stateName}.\n\nAtualmente suportamos:\n• Rio de Janeiro (RJ)\n• São Paulo (SP)\n• Minas Gerais (MG)`,
        [
          { text: 'Tentar novamente', onPress: () => setStep('qr_camera') },
          { text: 'Voltar', onPress: () => router.back() },
        ]
      )
      return
    }

    const chave = extractChaveAcesso(rawUrl)
    console.log('[QR] Chave extraída:', chave)

    await loadPots()
    setNfceUrl(sanitizeNFCeUrl(rawUrl))
    setNfceState(state)
    setNfceChave(chave)
    setNfceStateCode(stateCode || '33')
    setStep('processing')
  }

  const handleNFCeSuccess = (result: NFCeResult) => {
    setNfceUrl(null)
    setNfceState(null)
    setNfceChave(null)
    setNfceMeta({ cnpj: result.cnpj ?? null })
    setIrProviderDocument(result.cnpj ?? '')
    setIrProviderName(result.merchant ?? '')
    setMerchant(result.merchant ?? '')
    setTotal(result.total != null ? String(result.total) : '')
    setReceiptDate(normalizeDate(result.emission_date) ?? initialDisplayDate)
    setPaymentMethod(result.payment_method ?? 'debit')
    setReviewItems(sortReviewItemsByName((result.items ?? []).map((item, i) => ({
      id: String(i),
      name: item.name,
      valueCents: Math.round(item.totalValue * 100),
      quantity: item.quantity,
      unit: item.unit,
      potId: defaultPotId ?? null,
    }))))
    setImageUri(null)
    setReceiptId(null)
    setStep('review')
  }

  const handleNFCeError = (msg: string) => {
    setNfceUrl(null)
    setNfceState(null)
    setNfceChave(null)
    Alert.alert(
      'Não foi possível ler o cupom',
      msg,
      [
        { text: 'Tentar novamente', onPress: () => setStep('qr_camera') },
        { text: 'Voltar', onPress: () => router.back() },
      ]
    )
  }

  const handleSave = async () => {
    if (!user) return
    if (receiptDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(receiptDate)) {
      Alert.alert('Data inválida', 'Use o formato DD/MM/AAAA.')
      return
    }
    setStep('saving')

    const userId = user.id
    const todayISO = new Date().toISOString().split('T')[0]
    const today = /^\d{2}\/\d{2}\/\d{4}$/.test(receiptDate)
      ? receiptDate.split('/').reverse().join('-')
      : receiptDate || todayISO
    const totalAmount = parseFloat(total) || 0
    const isCredit = paymentMethod === 'credit'
    const card = cards.find(c => c.id === selectedCardId) ?? null

    const irFields = isIrDeductible ? {
      is_ir_deductible: true,
      ir_category: irCategory,
      ir_provider_name: irProviderName.trim() || null,
      ir_provider_document: irProviderDocument.trim() || null,
    } : {}

    try {
      const rows: any[] = []

      if (simplified) {
        if (totalAmount > 0) {
          const billingDate = isCredit
            ? (card ? calcBillingDate(today, card, 0) : calcBillingDateNoCard(today, 0))
            : null
          if (isCredit && isInstallment && installments > 1) {
            const groupId = genUUID()
            const installAmt = Math.round((totalAmount / installments) * 100) / 100
            for (let i = 0; i < installments; i++) {
              rows.push({
                user_id: userId, pot_id: singlePotId, type: 'expense',
                amount: installAmt,
                description: `${merchant || 'Cupom fiscal'} (${i + 1}/${installments})`,
                merchant: merchant || null, date: today,
                payment_method: paymentMethod, is_need: isNeed,
                card_id: selectedCardId ?? null,
                billing_date: card ? calcBillingDate(today, card, i) : calcBillingDateNoCard(today, i),
                installment_total: installments, installment_number: i + 1,
                installment_group_id: groupId,
                ...irFields,
              })
            }
          } else {
            rows.push({
              user_id: userId, pot_id: singlePotId, type: 'expense',
              amount: totalAmount, description: merchant || 'Cupom fiscal',
              merchant: merchant || null, date: today,
              payment_method: paymentMethod, is_need: isNeed,
              card_id: isCredit ? (selectedCardId ?? null) : null,
              billing_date: billingDate,
              ...irFields,
            })
          }
        }
      } else {
        const validItems = reviewItems.filter(i => i.valueCents > 0)
        for (const item of validItems) {
          if (isCredit && isInstallment && installments > 1) {
            const groupId = genUUID()
            const installAmt = Math.round((item.valueCents / installments) / 100 * 100) / 100
            for (let i = 0; i < installments; i++) {
              rows.push({
                user_id: userId, pot_id: item.potId, type: 'expense',
                amount: installAmt,
                description: `${item.name} (${i + 1}/${installments})`,
                merchant: merchant || null, date: today,
                payment_method: paymentMethod, is_need: isNeed,
                card_id: selectedCardId ?? null,
                billing_date: card ? calcBillingDate(today, card, i) : calcBillingDateNoCard(today, i),
                installment_total: installments, installment_number: i + 1,
                installment_group_id: groupId,
                ...irFields,
              })
            }
          } else {
            rows.push({
              user_id: userId, pot_id: item.potId, type: 'expense',
              amount: item.valueCents / 100, description: item.name,
              merchant: merchant || null, date: today,
              payment_method: paymentMethod, is_need: isNeed,
              card_id: isCredit ? (selectedCardId ?? null) : null,
              billing_date: isCredit
                ? (card ? calcBillingDate(today, card, 0) : calcBillingDateNoCard(today, 0))
                : null,
              ...irFields,
            })
          }
        }
      }

      if (rows.length > 0) {
        const { error: txErr } = await supabase.from('transactions').insert(rows)
        if (txErr) throw txErr

        // Registra cupom na tabela receipts para os badges "Leitor de Cupons" e "Detetive de Gastos".
        // O fluxo Gemini não chama a Edge Function, então precisamos inserir manualmente.
        await supabase.from('receipts').insert({
          user_id: userId,
          processed: true,
          merchant: merchant.trim() || null,
          total: totalAmount > 0 ? totalAmount : null,
          receipt_date: today,
          merchant_cnpj: nfceMeta?.cnpj ?? null,
        })
      }

      checkAndGrantBadges(userId, user.cycle_start ?? 1).then(b => { if (b.length > 0) setPendingBadges(b) })

      const count = simplified ? 1 : reviewItems.filter(i => i.valueCents > 0).length

      // Verificar opt-in para base colaborativa (apenas cupons NFC-e com itens)
      let localPriceData: typeof pendingPriceData = null
      if (nfceMeta && reviewItems.some(i => i.valueCents > 0)) {
        const optIn = await getUserPriceShareOptIn(userId)
        const priceItems = reviewItems
          .filter(i => i.valueCents > 0 && i.name)
          .map(i => ({ name: i.name, totalValue: i.valueCents / 100, quantity: i.quantity || 1 }))

        if (optIn === true) {
          submitPriceData(priceItems, merchant, '', nfceMeta.cnpj, today).catch(() => {})
        } else if (optIn === null) {
          localPriceData = { items: priceItems, merchant, cnpj: nfceMeta.cnpj, emission_date: today }
          setPendingPriceData(localPriceData)
        }
      }

      Alert.alert('Sucesso', `${count} lançamento${count !== 1 ? 's' : ''} registrado${count !== 1 ? 's' : ''}!`, [
        {
          text: 'OK',
          onPress: () => {
            if (localPriceData) {
              setShowOptInModal(true)
            } else {
              router.replace('/(tabs)/monthly')
            }
          },
        },
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
          <Text style={styles.headerTitle}>Registrar documento</Text>
          <View style={{ width: 60 }} />
        </View>

        {defaultPotName ? (
          <View style={[styles.potBadge, { marginTop: 12 }]}>
            <Text style={styles.potBadgeText}>🫙 {defaultPotName}</Text>
          </View>
        ) : null}

        <View style={styles.menuContainer}>
          <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 4 }}>
            Escolha como registrar
          </Text>

          <TouchableOpacity style={styles.menuOptionPrimary} onPress={() => setStep('qr_camera')}>
            <Text style={styles.menuOptionIcon}>📷</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuOptionTitlePrimary}>QR Code do cupom</Text>
              <Text style={styles.menuOptionDescPrimary}>Leia o QR Code do cupom NFC-e via câmera SEFAZ</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuOptionSecondary} onPress={handlePhotoCapture}>
            <Text style={styles.menuOptionIcon}>📸</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuOptionTitleSecondary}>Foto pela câmera</Text>
              <Text style={styles.menuOptionDescSecondary}>Fotografe cupons, comprovantes, notas e faturas</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuOptionSecondary} onPress={handleGalleryCapture}>
            <Text style={styles.menuOptionIcon}>🖼️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuOptionTitleSecondary}>Da galeria</Text>
              <Text style={styles.menuOptionDescSecondary}>Selecione uma imagem salva no dispositivo</Text>
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
          chaveAcesso={nfceChave}
          stateCode={nfceStateCode}
          onSuccess={handleNFCeSuccess}
          onError={handleNFCeError}
          onCancel={() => { setNfceUrl(null); setNfceState(null); setNfceChave(null); router.back() }}
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
        <PriceShareOptInModal
          visible={showOptInModal}
          onAccept={async () => {
            setShowOptInModal(false)
            if (user && pendingPriceData) {
              await setUserPriceShareOptIn(user.id, true)
              submitPriceData(
                pendingPriceData.items,
                pendingPriceData.merchant,
                '',
                pendingPriceData.cnpj,
                pendingPriceData.emission_date
              ).catch(() => {})
            }
            setPendingPriceData(null)
            router.replace('/(tabs)/monthly')
          }}
          onDecline={async () => {
            setShowOptInModal(false)
            if (user) await setUserPriceShareOptIn(user.id, false)
            setPendingPriceData(null)
            router.replace('/(tabs)/monthly')
          }}
        />
      </SafeAreaView>
    )
  }

  // ── STEP: review ──────────────────────────────────────────────────────────
  return (
    <>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('menu')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backBtn}>‹ Novo scan</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Revisar documento</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.reviewScroll} showsVerticalScrollIndicator={false}>

        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.thumbnail} resizeMode="cover" />
        )}

        {/* Document type banner — shown only for Gemini OCR path (not NFC-e) */}
        {!nfceMeta && imageUri && (() => {
          const cfg = DOC_TYPE_CONFIG[documentType]
          return (
            <View style={[styles.docTypeBanner, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
              <Text style={[styles.docTypeIcon]}>{cfg.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docTypeLabel, { color: cfg.color }]}>{cfg.label} identificado</Text>
                {ocrConfidence > 0 && ocrConfidence < 0.5 && (
                  <Text style={[styles.docTypeHint, { color: cfg.color }]}>
                    ⚠️ Confiança baixa — verifique os dados
                  </Text>
                )}
              </View>
            </View>
          )
        })()}

        {/* Extra fields for Pix / TED */}
        {(documentType === 'comprovante_pix' || documentType === 'comprovante_ted') && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>
              {documentType === 'comprovante_pix' ? '🔄 Dados do Pix' : '🔄 Dados da Transferência'}
            </Text>
            {recipientName ? <><Text style={styles.fieldLabel}>Destinatário</Text>
              <Text style={styles.docInfoText}>{recipientName}</Text></> : null}
            {bankOrigin ? <><Text style={styles.fieldLabel}>Banco de origem</Text>
              <Text style={styles.docInfoText}>{bankOrigin}</Text></> : null}
            {bankDestination ? <><Text style={styles.fieldLabel}>Banco de destino</Text>
              <Text style={styles.docInfoText}>{bankDestination}</Text></> : null}
            {pixKey ? <><Text style={styles.fieldLabel}>Chave Pix</Text>
              <Text style={styles.docInfoText}>{pixKey}</Text></> : null}
            {pixEndToEnd ? <><Text style={styles.fieldLabel}>ID da transação</Text>
              <Text style={[styles.docInfoText, { fontSize: 11 }]}>{pixEndToEnd}</Text></> : null}
          </View>
        )}

        {/* Extra fields for Nota de Serviço */}
        {documentType === 'nota_servico' && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>🧾 Nota de Serviço</Text>
            {serviceDescription ? <><Text style={styles.fieldLabel}>Descrição do serviço</Text>
              <Text style={styles.docInfoText}>{serviceDescription}</Text></> : null}
            {competencePeriod ? <><Text style={styles.fieldLabel}>Período de competência</Text>
              <Text style={styles.docInfoText}>{competencePeriod}</Text></> : null}
          </View>
        )}

        {/* Extra fields for Fatura */}
        {documentType === 'fatura' && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>📃 Fatura</Text>
            {competencePeriod ? <><Text style={styles.fieldLabel}>Período de referência</Text>
              <Text style={styles.docInfoText}>{competencePeriod}</Text></> : null}
          </View>
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
            placeholder="DD/MM/AAAA"
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

          {paymentMethod === 'credit' && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 12, marginBottom: 8 }]}>Cartão</Text>
              {cards.length === 0 ? (
                <Text style={styles.payHint}>Nenhum cartão cadastrado — lançamento sem vínculo de fatura.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {cards.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setSelectedCardId(c.id)}
                      style={[styles.payChip, { marginRight: 8 }, selectedCardId === c.id && styles.payChipActive]}
                    >
                      <Text style={[styles.payChipText, selectedCardId === c.id && styles.payChipTextActive]}>
                        💳 {c.name}{c.last_four ? ` ••${c.last_four}` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Text style={styles.sectionLabel}>Compra parcelada?</Text>
                <TouchableOpacity
                  onPress={() => setIsInstallment(v => !v)}
                  style={{
                    width: 44, height: 24, borderRadius: 12,
                    backgroundColor: isInstallment ? Colors.primary : Colors.border,
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}
                >
                  <View style={{
                    width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                    alignSelf: isInstallment ? 'flex-end' : 'flex-start',
                  }} />
                </TouchableOpacity>
              </View>

              {isInstallment && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, backgroundColor: Colors.background, borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 13, color: Colors.textDark }}>Nº de parcelas</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <TouchableOpacity onPress={() => setInstallments(v => Math.max(2, v - 1))} style={{ padding: 6 }}>
                      <Text style={{ fontSize: 20, color: Colors.primary, fontWeight: '700' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.primary, minWidth: 30, textAlign: 'center' }}>{installments}x</Text>
                    <TouchableOpacity onPress={() => setInstallments(v => Math.min(24, v + 1))} style={{ padding: 6 }}>
                      <Text style={{ fontSize: 20, color: Colors.primary, fontWeight: '700' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {irModuleEnabled && (
          <View style={styles.card}>
            <View style={styles.irToggleRow}>
              <View>
                <Text style={styles.irToggleLabel}>Dedutível no IR</Text>
                <Text style={styles.irToggleHint}>Aplica a todos os itens do cupom</Text>
              </View>
              <Switch
                value={isIrDeductible}
                onValueChange={setIsIrDeductible}
                trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
                thumbColor={isIrDeductible ? Colors.primary : Colors.textMuted}
              />
            </View>
            {isIrDeductible && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Categoria IR</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {(Object.entries(IR_CATEGORY_LABELS) as [IRCategory, string][]).map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setIrCategory(key)}
                      style={[styles.payChip, irCategory === key && styles.payChipActive]}
                    >
                      <Text style={[styles.payChipText, irCategory === key && styles.payChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Prestador</Text>
                <TextInput
                  style={[styles.fieldInput, { marginBottom: 8 }]}
                  value={irProviderName}
                  onChangeText={setIrProviderName}
                  placeholder="Ex: Hospital, escola…"
                  placeholderTextColor={Colors.textMuted}
                />
                <Text style={styles.fieldLabel}>CPF/CNPJ do prestador</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={irProviderDocument}
                  onChangeText={setIrProviderDocument}
                  placeholder="000.000.000-00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                />
              </>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>É uma necessidade?</Text>
          <IsNeedSelector value={isNeed} onChange={setIsNeed} />
        </View>

        <View style={styles.simplifiedSwitchCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.simplifiedSwitchTitle}>Modo simplificado</Text>
            <Text style={styles.simplifiedSwitchSub}>
              {simplified ? 'Todos os itens vão para um pote' : 'Selecionar pote por item'}
            </Text>
          </View>
          <Switch
            value={simplified}
            onValueChange={val => {
              setSimplified(val)
              if (!val) setSinglePotId(defaultPotId ?? null)
            }}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={simplified ? '#fff' : '#f4f3f4'}
          />
        </View>

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
                  <Text style={{ fontSize: 14 }}>{getPotIcon(pot.name)}</Text>
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
      <PriceShareOptInModal
        visible={showOptInModal}
        onAccept={async () => {
          setShowOptInModal(false)
          if (user && pendingPriceData) {
            await setUserPriceShareOptIn(user.id, true)
            submitPriceData(
              pendingPriceData.items,
              pendingPriceData.merchant,
              '',
              pendingPriceData.cnpj,
              pendingPriceData.emission_date
            ).catch(() => {})
          }
          setPendingPriceData(null)
          router.replace('/(tabs)/monthly')
        }}
        onDecline={async () => {
          setShowOptInModal(false)
          if (user) await setUserPriceShareOptIn(user.id, false)
          setPendingPriceData(null)
          router.replace('/(tabs)/monthly')
        }}
      />
    </SafeAreaView>
    <CreditCardModal
      visible={showCreditCardModal}
      onClose={() => {
        setShowCreditCardModal(false)
        if (!user) return
        supabase.from('credit_cards').select('*').eq('user_id', user.id)
          .then(({ data }) => {
            const list = (data as CreditCard[]) ?? []
            setCards(list)
            setSelectedCardId(list[0]?.id ?? null)
          })
      }}
    />
    </>
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
  simplifiedSwitchCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.border,
  },
  simplifiedSwitchTitle: { fontSize: 14, fontWeight: '700', color: Colors.textDark },
  simplifiedSwitchSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  // Mode toggle (kept for reference)
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
  irToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  irToggleLabel: { fontSize: 14, fontWeight: '700', color: Colors.textDark },
  irToggleHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  // Document type banner
  docTypeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12,
  },
  docTypeIcon: { fontSize: 22 },
  docTypeLabel: { fontSize: 14, fontWeight: '700' },
  docTypeHint: { fontSize: 11, marginTop: 2 },
  docInfoText: { fontSize: 14, color: Colors.textDark, marginBottom: 8 },
})
