/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Modal de importação de dados — lê arquivos .xlsx via
 * DocumentPicker e importa lançamentos históricos para o Supabase.
 * Exibe preview com validação antes de confirmar a importação.
 */

import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, FlatList, Alert, ScrollView,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as XLSX from 'xlsx'
import { Colors } from '../constants/colors'
import { supabase } from '../lib/supabase'
import { getPotIcon } from '../lib/potIcons'
import { brl } from '../lib/finance'
import { Pot, CreditCard } from '../types'
import { downloadImportTemplate } from '../lib/import-template'
import { CreditCardModal } from './CreditCardModal'
import { extractBankStatementWithGemini, partitionBillPayments, StatementType, BankStatementTxn } from '../lib/bank-statement-ai'
import { calcBillingDate, calcBillingDateNoCard, CycleOverridesMap } from '../lib/billing-date'
import { getCardOverridesMap } from '../lib/credit-cards'
import { expandFutureInstallments, billingMonthKey } from '../lib/installment-expansion'
import { getMerchantPotMap } from '../lib/smart-merchants'
import { PaywallBanner } from './PaywallBanner'
import { useAuthStore } from '../stores/useAuthStore'
import { router } from 'expo-router'

type ImportRow = {
  date: string
  description: string
  merchant: string
  amount: number
  type: 'expense' | 'income'
  paymentMethod: string
  installmentTotal: number
  potId: string | null
  poteName: string  // nome do pote da planilha (para exibição e resolução)
  isNeed: boolean | null
  // Parcelamento detectado na fatura (feature: expandir parcelas futuras). Preenchidos
  // ao entrar no step 'assign', quando o cartão já foi escolhido.
  installmentNumber?: number
  installmentTotalDetected?: number
  installmentGroupId?: string | null
  billingDate?: string          // billing_date já calculado para esta parcela específica
  isSyntheticFuture?: boolean    // true = parcela futura criada automaticamente
}

type Step = 'pick' | 'preview' | 'card_select' | 'assign' | 'saving' | 'done'

type ImportMode = 'excel' | 'bank_pdf'

type Props = {
  visible: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  pots: Pot[]
  userId: string
  cycleStartISO: string
  cycleEndISO: string
}

// --- Helpers ---

function formatDateISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateISO(raw: any): string {
  const today = formatDateISO(new Date())
  if (!raw) return today
  // Excel serial date (number) — use local date to avoid UTC offset shifting the day
  if (typeof raw === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(raw)
      if (d && d.y > 1900) {
        return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      }
    } catch {}
    // Fallback: Unix epoch conversion (Excel serial → ms)
    const dt = new Date(Math.round((raw - 25569) * 86400 * 1000))
    if (!isNaN(dt.getTime())) return formatDateISO(dt)
    return today
  }
  const s = String(raw).trim()
  // DD/MM/YYYY or D/M/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  // DD/MM/YY (2-digit year)
  const dmy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (dmy2) return `20${dmy2[3]}-${dmy2[2].padStart(2, '0')}-${dmy2[1].padStart(2, '0')}`
  // YYYY-M-D or YYYY-MM-DD — always normalize with zero padding
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  return today
}

function parseAmount(raw: any): number {
  if (typeof raw === 'number') return Math.abs(raw)
  let s = String(raw).replace(/[R$\s]/g, '')
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // Both separators present — whichever comes last is the decimal separator
    if (lastComma > lastDot) {
      // Brazilian: 1.234,56 → remove dots (thousands), replace comma with dot
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // US: 1,234.56 → remove commas (thousands)
      s = s.replace(/,/g, '')
    }
  } else if (lastComma >= 0) {
    // Only comma: treat as decimal separator (ex: 45,90)
    s = s.replace(',', '.')
  }
  // Only dot (or no separator): parseFloat handles it directly
  return Math.abs(parseFloat(s) || 0)
}

function normalize(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Like parseDateISO but returns null instead of falling back to today
function parseDateISOStrict(raw: any): string | null {
  if (!raw) return null
  if (typeof raw === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(raw)
      if (d && d.y > 1900) {
        return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      }
    } catch {}
    const dt = new Date(Math.round((raw - 25569) * 86400 * 1000))
    if (!isNaN(dt.getTime())) return formatDateISO(dt)
    return null
  }
  const s = String(raw).trim()
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const dmy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (dmy2) return `20${dmy2[3]}-${dmy2[2].padStart(2, '0')}-${dmy2[1].padStart(2, '0')}`
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  return null
}

function validateImportRows(data: any[][]): string[] {
  if (data.length < 2) return []
  const header = data[0].map((h: any) => String(h ?? '').toLowerCase().trim())
  const colIdx = (names: string[]) =>
    names.reduce<number>((found, n) => found >= 0 ? found : header.findIndex(h => h.includes(n)), -1)

  const dateCol = colIdx(['data', 'date'])
  const descCol = colIdx(['descri', 'desc', 'hist', 'memo'])
  const typeCol = colIdx(['tipo', 'type'])
  const payCol  = colIdx(['pagamento', 'payment', 'forma'])
  const amtCol  = colIdx(['valor', 'amount', 'value', 'total'])

  const errors: string[] = []

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (amtCol < 0 || row[amtCol] == null) continue
    if (parseAmount(row[amtCol]) <= 0) continue

    const lineNum = i + 1

    if (dateCol >= 0 && parseDateISOStrict(row[dateCol]) === null) {
      errors.push(`Linha ${lineNum}: data inválida "${row[dateCol]}" — use DD/MM/AAAA`)
    }

    if (descCol >= 0 && !String(row[descCol] ?? '').trim()) {
      errors.push(`Linha ${lineNum}: Descrição é obrigatória`)
    }

    if (typeCol >= 0) {
      const t = normalize(String(row[typeCol] ?? ''))
      if (!t.includes('recei') && !t.includes('gasto') && !t.includes('income') && !t.includes('expense') && !t.includes('despesa')) {
        errors.push(`Linha ${lineNum}: Tipo inválido "${row[typeCol]}" — use "gasto" ou "receita"`)
      }
    }

    const isExpense = typeCol < 0 || (() => {
      const t = normalize(String(row[typeCol] ?? ''))
      return !t.includes('recei') && !t.includes('income')
    })()
    if (isExpense && payCol >= 0 && !String(row[payCol] ?? '').trim()) {
      errors.push(`Linha ${lineNum}: Forma de Pagamento é obrigatória para gastos`)
    }
  }

  return errors
}

function parsePaymentMethod(raw: any): string {
  const s = normalize(String(raw ?? ''))
  if (s.includes('cred')) return 'credit'
  if (s.includes('deb')) return 'debit'
  if (s === 'pix' || s.includes('pix')) return 'pix'
  if (s.includes('dinh') || s.includes('cash')) return 'cash'
  if (s.includes('transf')) return 'transfer'
  if (s.includes('aliment')) return 'voucher_alimentacao'
  if (s.includes('refei')) return 'voucher_refeicao'
  return 'cash'  // 'other' is not a valid payment_method in the DB
}

function parseType(raw: any): 'expense' | 'income' {
  const s = normalize(String(raw ?? ''))
  if (s.includes('recei') || s === 'income') return 'income'
  return 'expense'  // despesa, gasto, expense → expense
}

function parseNeed(raw: any): boolean | null {
  const s = normalize(String(raw ?? '')).trim()
  if (s === '') return true  // célula vazia = SIM
  if (s === 'nao' || s === 'desejo') return false
  if (s === 'nao_informado' || s === 'nao informado') return null
  return true  // default SIM
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

function genUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function parseSheet(data: any[][]): ImportRow[] {
  if (data.length < 2) return []
  const header = data[0].map((h: any) => String(h ?? '').toLowerCase().trim())
  const colIdx = (names: string[]) =>
    names.reduce<number>((found, n) => found >= 0 ? found : header.findIndex(h => h.includes(n)), -1)

  const dateCol     = colIdx(['data', 'date'])
  const descCol     = colIdx(['descri', 'desc', 'hist', 'memo'])
  const amtCol      = colIdx(['valor', 'amount', 'value', 'total'])
  const typeCol     = colIdx(['tipo', 'type'])
  const payCol      = colIdx(['pagamento', 'payment', 'forma'])
  const merchantCol = colIdx(['estabelecimento', 'merchant', 'loja', 'fornecedor'])
  const installCol  = colIdx(['parcela', 'parcel', 'installment'])
  const poteCol     = colIdx(['pote', 'categoria', 'category'])
  const needCol     = colIdx(['necessidade', 'necessário', 'necessario'])

  if (amtCol < 0) return []

  return data.slice(1).filter(row => row[amtCol] != null).map(row => {
    const rawAmt = row[amtCol]
    const amount = parseAmount(rawAmt)
    const type: 'expense' | 'income' = typeCol >= 0
      ? parseType(row[typeCol])
      : (typeof rawAmt === 'number' && rawAmt < 0 ? 'income' : 'expense')
    const paymentMethod = payCol >= 0 ? parsePaymentMethod(row[payCol]) : 'cash'  // was 'other' — invalid in DB
    const installmentTotal = installCol >= 0
      ? (parseInt(String(row[installCol] ?? '1')) || 1)
      : 1
    return {
      date: parseDateISO(dateCol >= 0 ? row[dateCol] : null),
      description: descCol >= 0 ? String(row[descCol] ?? '').trim() : 'Importado',
      merchant: merchantCol >= 0 ? String(row[merchantCol] ?? '').trim() : '',
      amount,
      type,
      paymentMethod,
      installmentTotal: type === 'expense' ? installmentTotal : 1,
      potId: null,
      poteName: poteCol >= 0 ? String(row[poteCol] ?? '').trim() : '',
      isNeed: type === 'expense'
        ? (needCol >= 0 ? parseNeed(row[needCol]) : true)  // default SIM
        : null,
    }
  }).filter(r => r.amount > 0)
}

// --- Excel preview (static model) ---

const EXCEL_HEADERS = ['tipo', 'descrição', 'data', 'valor', 'pagamento', 'estabelecimento', 'parcelas', 'pote']

const getColWidth = (header: string) =>
  ['descrição', 'estabelecimento', 'pote'].includes(header) ? 110 : 80

const EXCEL_SAMPLE = [
  ['gasto', 'Almoço', '22/03/2026', '135,15', 'crédito', 'Restaurante X', '1', 'Alimentação'],
  ['gasto', 'Notebook', '22/03/2026', '3600,00', 'crédito', 'Magazine', '12', 'Tecnologia'],
  ['receita', 'Salário', '01/03/2026', '17000,00', 'depósito', '', '', ''],
]

function ExcelPreview() {
  return (
    <View style={exStyles.wrapper}>
      <Text style={exStyles.label}>Modelo de planilha esperado:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={exStyles.headerRow}>
            {EXCEL_HEADERS.map(h => (
              <View key={h} style={[exStyles.cell, exStyles.headerCell, { width: getColWidth(h) }]}>
                <Text style={exStyles.headerText}>{h}</Text>
              </View>
            ))}
          </View>
          {EXCEL_SAMPLE.map((vals, i) => {
            const bg = i % 2 === 0 ? '#fff' : '#f0f7f0'
            const tipoColor = vals[0] === 'receita' ? Colors.success : Colors.danger
            return (
              <View key={i} style={[exStyles.dataRow, { backgroundColor: bg }]}>
                {EXCEL_HEADERS.map((h, ci) => (
                  <View key={h} style={[exStyles.cell, { width: getColWidth(h) }]}>
                    <Text style={[exStyles.dataText, ci === 0 && { color: tipoColor, fontWeight: '700' }]} numberOfLines={1}>
                      {vals[ci]}
                    </Text>
                  </View>
                ))}
              </View>
            )
          })}
        </View>
      </ScrollView>
      <View style={exStyles.legend}>
        <Text style={exStyles.legendText}>
          <Text style={{ fontWeight: '700' }}>Obrigatórios:</Text> tipo, descrição, data, valor{'\n'}
          <Text style={{ fontWeight: '700' }}>Gastos:</Text> pagamento e pote recomendados{'\n'}
          <Text style={{ fontWeight: '700' }}>Opcionais:</Text> estabelecimento, parcelas{'\n'}
          <Text style={{ color: Colors.primary, fontWeight: '600' }}>💡 Dica:</Text>
          <Text>{' '}O nome do pote deve ser igual ao cadastrado no app. Formas de pagamento: dinheiro, débito, crédito, pix, transferência, vale alimentação, vale refeição.</Text>
        </Text>
      </View>
    </View>
  )
}

const exStyles = StyleSheet.create({
  wrapper: { width: '100%', gap: 8 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textDark },
  headerRow: { flexDirection: 'row' },
  headerCell: { backgroundColor: '#217346' },
  dataRow: { flexDirection: 'row' },
  cell: { paddingVertical: 5, paddingHorizontal: 6, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#c8e6c9' },
  headerText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  dataText: { fontSize: 10, color: Colors.textDark },
  legend: { backgroundColor: Colors.lightBlue, borderRadius: 8, padding: 10 },
  legendText: { fontSize: 11, color: Colors.textDark, lineHeight: 18 },
})

// --- Main component ---

export function ImportFileModal({ visible, onClose, onSuccess, pots, userId, cycleStartISO, cycleEndISO }: Props) {
  const [step, setStep] = useState<Step>('pick')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [filename, setFilename] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const [cards, setCards] = useState<CreditCard[]>([])
  const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [templateSuccess, setTemplateSuccess] = useState(false)
  const [showCreditCardModal, setShowCreditCardModal] = useState(false)
  // Modo de importação: planilha Excel (padrão) ou extrato bancário em PDF
  const [importMode, setImportMode] = useState<ImportMode>('excel')
  const [statementType, setStatementType] = useState<StatementType | null>(null)
  const [parsingPdf, setParsingPdf] = useState(false)
  const [detectedBank, setDetectedBank] = useState<string | null>(null)
  // Overrides de ciclo do cartão selecionado (carregados 1x ao entrar em 'assign').
  const [overridesMap, setOverridesMap] = useState<CycleOverridesMap>({})
  // Parcelas futuras que já existiam e foram puladas na expansão (dedup).
  const [dupSkipped, setDupSkipped] = useState(0)
  const [preparingAssign, setPreparingAssign] = useState(false)
  const { isPremium } = useAuthStore()

  useEffect(() => {
    if (visible) loadCards()
  }, [visible])

  const loadCards = async () => {
    const { data } = await supabase
      .from('credit_cards').select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    setCards((data ?? []) as CreditCard[])
  }

  const reset = () => {
    setStep('pick'); setRows([]); setFilename('')
    setSelectedCard(null); setTemplateSuccess(false)
    setImportMode('excel'); setStatementType(null); setParsingPdf(false)
    setDetectedBank(null)
    setOverridesMap({}); setDupSkipped(0); setPreparingAssign(false)
  }

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true)
    setTemplateSuccess(false)
    try {
      await downloadImportTemplate()
      setTemplateSuccess(true)
      setTimeout(() => setTemplateSuccess(false), 4000)
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível gerar o modelo.')
    } finally {
      setDownloadingTemplate(false)
    }
  }
  const handleClose = () => { reset(); onClose() }

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]
      setFilename(asset.name)
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 })
      const wb = XLSX.read(b64, { type: 'base64' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

      const erros = validateImportRows(data)
      if (erros.length > 0) {
        Alert.alert(
          '⚠️ Erros encontrados',
          `Corrija os problemas abaixo antes de importar:\n\n${erros.slice(0, 10).join('\n')}${erros.length > 10 ? `\n...e mais ${erros.length - 10} erros` : ''}`,
          [{ text: 'OK' }]
        )
        return
      }

      const parsed = parseSheet(data)
      if (parsed.length === 0) {
        Alert.alert('Arquivo vazio', 'Não encontramos transações válidas. Verifique o formato do arquivo.')
        return
      }
      // Resolve potId from poteName using the pots prop (case-insensitive match)
      const resolved = parsed.map(row => {
        if (!row.poteName) return row
        const found = pots.find(p =>
          p.name.toLowerCase().trim() === row.poteName.toLowerCase().trim()
        )
        return { ...row, potId: found?.id ?? null }
      })
      setRows(resolved)
      setStep('preview')
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível abrir o arquivo.')
    }
  }

  const canPickBankPdf = !!statementType

  // Mapeia um lançamento extraído pela IA para o formato ImportRow do modal.
  // date vem DD/MM/AAAA da IA → parseDateISO converte pra ISO; potId sempre null.
  const bankTxnToRow = (t: BankStatementTxn): ImportRow => ({
    date: parseDateISO(t.date),
    description: t.description,
    merchant: t.merchant,
    amount: t.amount,
    type: t.type,
    paymentMethod: t.paymentMethod,
    installmentTotal: 1,
    potId: null,
    poteName: '',
    isNeed: t.type === 'expense' ? true : null,
    installmentNumber: t.installmentNumber,
    installmentTotalDetected: t.installmentTotalDetected,
  })

  // Confere a soma dos lançamentos com o total declarado (só faz sentido na
  // fatura de crédito: total = compras − estornos). No débito, o "total" é o
  // saldo final do período, que não é a soma dos lançamentos, então pulamos.
  const warnIfTotalMismatch = (txns: BankStatementTxn[], declaredTotal: number | null) => {
    if (statementType !== 'credito' || declaredTotal == null) return
    const sum = txns.reduce((s, t) => s + (t.type === 'income' ? -t.amount : t.amount), 0)
    if (Math.abs(sum - declaredTotal) > 0.05) {
      Alert.alert(
        '⚠️ Conferir total',
        `A soma dos lançamentos (${brl(sum)}) não confere com o total do extrato (${brl(declaredTotal)}). ` +
        `Pode ter faltado ou sobrado algum item — revise com atenção antes de confirmar.`,
      )
    }
  }

  const goToPreviewWith = (txns: BankStatementTxn[], declaredTotal: number | null) => {
    if (txns.length === 0) {
      Alert.alert('Nenhuma transação encontrada', 'Não conseguimos extrair lançamentos deste extrato. Verifique se o PDF é o extrato/fatura correto e tente de novo.')
      return
    }
    setRows(txns.map(bankTxnToRow))
    setStep('preview')
    warnIfTotalMismatch(txns, declaredTotal)
  }

  const pickBankPDF = async () => {
    if (!statementType) return
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]
      setFilename(asset.name)
      setParsingPdf(true)
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 })
      const { bank, declaredTotal, transactions } = await extractBankStatementWithGemini(b64, statementType)
      setDetectedBank(bank)

      // Pagamento de fatura de cartão detectado → perguntar se inclui ou não
      const { billPayments, withoutBillPayments, includedAsTransfer } = partitionBillPayments(transactions)
      // Diagnóstico (removido no APK release por transform-remove-console): confirma
      // que o filtro remove exatamente os itens marcados isCreditCardBillPayment.
      console.log(
        `[Import fatura] total=${transactions.length} | isCreditCardBillPayment=true: ${billPayments.length} | ` +
        `após excluir: ${withoutBillPayments.length} (esperado ${transactions.length - billPayments.length})`
      )
      if (billPayments.length > 0) {
        const totalBill = billPayments.reduce((s, t) => s + t.amount, 0)
        Alert.alert(
          'Pagamento de fatura detectado',
          `Detectamos ${brl(totalBill)} em pagamento(s) de fatura de cartão de crédito neste extrato. ` +
          `Esse valor costuma duplicar os gastos do cartão, que já entram pela fatura de crédito. O que deseja fazer?`,
          [
            {
              text: 'Excluir esse valor da importação',
              onPress: () => goToPreviewWith(withoutBillPayments, declaredTotal),
            },
            {
              text: 'Incluir mesmo assim',
              onPress: () => goToPreviewWith(includedAsTransfer, declaredTotal),
            },
          ],
        )
        return
      }

      goToPreviewWith(transactions, declaredTotal)
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível processar o extrato.')
    } finally {
      setParsingPdf(false)
    }
  }

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx))

  const setRowPot = (idx: number, potId: string | null) => {
    setRows(prev => { const next = [...prev]; next[idx] = { ...next[idx], potId }; return next })
  }

  const handleConfirmPreview = () => {
    const hasCreditItems = rows.some(r => r.type === 'expense' && r.paymentMethod === 'credit')
    if (hasCreditItems && cards.length === 0) {
      Alert.alert(
        'Nenhum cartão cadastrado',
        'Há lançamentos de crédito na importação, mas você não tem cartões cadastrados. Cadastre um cartão ou use o cartão genérico.',
        [
          { text: 'Cadastrar cartão', onPress: () => setShowCreditCardModal(true) },
          { text: 'Usar genérico', onPress: () => enterAssign(null) },
        ]
      )
      return
    }
    if (hasCreditItems) setStep('card_select')
    else enterAssign(null)
  }

  // Busca no banco as chaves (merchant|amount|mês) de parcelas de crédito já
  // existentes para o cartão, usadas na dedup das parcelas futuras. Uma query só.
  const fetchExistingInstallmentKeys = async (cardId: string | null): Promise<Set<string>> => {
    let q = supabase
      .from('transactions')
      .select('merchant, amount, billing_date')
      .eq('user_id', userId)
      .eq('payment_method', 'credit')
      .not('billing_date', 'is', null)
    q = cardId ? q.eq('card_id', cardId) : q.is('card_id', null)
    const { data } = await q
    const set = new Set<string>()
    for (const t of (data ?? []) as any[]) {
      if (!t.billing_date) continue
      set.add(billingMonthKey(t.merchant ?? '', Number(t.amount), t.billing_date))
    }
    return set
  }

  // Entrada única no step 'assign' com o cartão já resolvido. Carrega os overrides
  // do cartão e, no import de fatura (bank_pdf), expande as compras parceladas em
  // parcelas futuras (dedup contra o que já existe). Idempotente: reexpande sempre
  // a partir das âncoras, removendo futuras sintéticas de uma passada anterior.
  const enterAssign = async (card: CreditCard | null) => {
    setSelectedCard(card)
    setPreparingAssign(true)
    try {
      const overrides = card ? await getCardOverridesMap(card.id) : {}
      setOverridesMap(overrides)

      let working: ImportRow[] = rows
      if (importMode === 'bank_pdf') {
        const anchors = rows.filter(r => !r.isSyntheticFuture)
        const hasParceled = anchors.some(r =>
          r.paymentMethod === 'credit' &&
          (r.installmentTotalDetected ?? 0) > (r.installmentNumber ?? 0) &&
          (r.installmentNumber ?? 0) >= 1
        )
        const existingKeys = hasParceled
          ? await fetchExistingInstallmentKeys(card?.id ?? null)
          : new Set<string>()

        const out: ImportRow[] = []
        let skippedTotal = 0
        for (const r of anchors) {
          const N = r.installmentNumber ?? 0
          const T = r.installmentTotalDetected ?? 0
          if (r.paymentMethod === 'credit' && T > N && N >= 1) {
            const groupId = genUUID()
            const { rows: expanded, skipped } = expandFutureInstallments(
              { date: r.date, merchant: r.merchant, amount: r.amount, description: r.description, installmentNumber: N, installmentTotalDetected: T },
              card, overrides, existingKeys, groupId,
            )
            skippedTotal += skipped
            for (const e of expanded) {
              out.push({
                ...r,
                description: e.description,
                installmentNumber: e.installmentNumber,
                installmentTotalDetected: e.installmentTotalDetected,
                installmentGroupId: e.installmentGroupId,
                billingDate: e.billingDate,
                isSyntheticFuture: e.isSyntheticFuture,
              })
            }
          } else {
            out.push(r)
          }
        }
        working = out
        setDupSkipped(skippedTotal)
      }

      // Pré-preenche o pote sugerido (smart_merchants) em cada linha com merchant
      // preenchido e ainda SEM pote — o maior ganho da sugestão, já que aqui o
      // usuário revisa dezenas de linhas. 1 query (mapa), aplicado em memória.
      const merchantMap = await getMerchantPotMap(userId)
      const withSuggestions = working.map(r => {
        const m = r.merchant?.trim().toLowerCase()
        if (r.potId || !m) return r
        const potId = merchantMap[m]
        return potId && pots.some(p => p.id === potId) ? { ...r, potId } : r
      })
      setRows(withSuggestions)
    } finally {
      setPreparingAssign(false)
      setStep('assign')
    }
  }

  const saveAll = async () => {
    setStep('saving')
    try {
      // Always use live auth session — prop may be stale or from wrong user
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const resolvedUserId = authUser?.id
      if (!resolvedUserId) {
        Alert.alert('Erro', 'Sessão expirada. Faça login novamente.')
        setStep('assign')
        return
      }

      const inserts: any[] = []

      for (const r of rows) {
        const isCredit = r.paymentMethod === 'credit'

        if (isCredit) {
          // Fatura: parcela detectada (atual ou futura) — 1 insert por linha, com
          // billing_date já calculado na expansão e o grupo/numeração da parcela.
          if (r.installmentTotalDetected && r.installmentTotalDetected > 1) {
            const billingDate = r.billingDate
              ?? (selectedCard ? calcBillingDate(r.date, selectedCard, 0, overridesMap) : calcBillingDateNoCard(r.date, 0))
            inserts.push({
              user_id: resolvedUserId,
              pot_id: r.potId,
              card_id: selectedCard?.id ?? null,
              type: r.type,
              amount: r.amount,
              description: r.description,  // já contém "(k/T)"
              merchant: r.merchant || null,
              date: r.date,
              billing_date: billingDate,
              payment_method: 'credit',
              is_need: r.isNeed,
              installment_total: r.installmentTotalDetected,
              installment_number: r.installmentNumber ?? null,
              installment_group_id: r.installmentGroupId ?? null,
            })
            continue
          }

          // Crédito: criar APENAS as parcelas — nunca inserir o valor total separado
          const installmentCount = r.installmentTotal
          const installmentValue = Math.round((r.amount / installmentCount) * 100) / 100
          const groupId = installmentCount > 1 ? genUUID() : null

          for (let i = 0; i < installmentCount; i++) {
            const billingDate = selectedCard
              ? calcBillingDate(r.date, selectedCard, i, overridesMap)
              : calcBillingDateNoCard(r.date, i)

            inserts.push({
              user_id: resolvedUserId,
              pot_id: r.potId,
              card_id: selectedCard?.id ?? null,
              type: r.type,
              amount: installmentValue,
              description: installmentCount > 1
                ? `${r.description} (${i + 1}/${installmentCount})`
                : r.description,
              merchant: r.merchant || null,
              date: r.date,
              billing_date: billingDate,
              payment_method: 'credit',
              is_need: r.isNeed,
              installment_total: installmentCount > 1 ? installmentCount : null,
              installment_number: installmentCount > 1 ? i + 1 : null,
              installment_group_id: groupId,
            })
          }
        } else {
          // Não crédito: uma transaction com valor total, sem billing_date
          inserts.push({
            user_id: resolvedUserId,
            pot_id: r.potId,
            card_id: null,
            type: r.type,
            amount: r.amount,
            description: r.description,
            merchant: r.merchant || null,
            date: r.date,
            billing_date: null,
            payment_method: r.paymentMethod,
            is_need: r.isNeed,
            installment_total: null,
            installment_number: null,
            installment_group_id: null,
          })
        }
      }

      // Auto-fix any invalid fields before insert
      const dateRe = /^\d{4}-\d{2}-\d{2}$/
      for (const t of inserts) {
        if (!t.date || !dateRe.test(t.date)) t.date = formatDateISO(new Date())
        if (t.billing_date && !dateRe.test(t.billing_date)) t.billing_date = null
        if (!['expense', 'income', 'goal_deposit'].includes(t.type)) t.type = 'expense'
        if (!['credit', 'debit', 'pix', 'cash', 'transfer', 'voucher_alimentacao', 'voucher_refeicao'].includes(t.payment_method)) t.payment_method = 'cash'
      }

      const { data: inserted, error } = await supabase.from('transactions').insert(inserts).select()
      if (error) throw error
      const savedN = inserted?.length ?? inserts.length
      setSavedCount(savedN)
      setStep('done')
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e?.message ?? 'Tente novamente.')
      setStep('assign')
    }
  }

  const totalTransactions = rows.reduce((s, r) => s + r.installmentTotal, 0)

  const renderPreviewRow = ({ item, index }: { item: ImportRow; index: number }) => (
    <View style={styles.previewRow}>
      <Text style={[styles.typeIndicator, { color: item.type === 'income' ? Colors.success : Colors.danger }]}>
        {item.type === 'income' ? '↑' : '↓'}
      </Text>
      <View style={{ flex: 1, marginHorizontal: 8 }}>
        <Text style={styles.previewDesc} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.previewMeta}>{item.date} · {item.paymentMethod}</Text>
        {item.type === 'expense' && item.paymentMethod === 'credit' && item.installmentTotal > 1 && (
          <Text style={[styles.previewMeta, { color: Colors.warning }]}>
            💳 {item.installmentTotal}x de {brl(item.amount / item.installmentTotal)} — vencimentos calculados pelo cartão
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Text style={[styles.previewAmt, { color: item.type === 'income' ? Colors.success : Colors.danger }]}>
          {item.type === 'income' ? '+' : '-'}{brl(item.amount)}
        </Text>
        {item.installmentTotal > 1 && item.paymentMethod !== 'credit' && (
          <View style={styles.installBadge}>
            <Text style={styles.installBadgeText}>
              {item.installmentTotal}x de {brl(item.amount / item.installmentTotal)}
            </Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={() => removeRow(index)} style={styles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  )

  const renderAssignRow = ({ item, index }: { item: ImportRow; index: number }) => {
    const poteNotFound = !!item.poteName && !item.potId
    const poteFound = !!item.poteName && !!item.potId
    return (
      <View style={styles.assignCard}>
        {/* Row 1: type indicator + description + amount */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Text style={[styles.typeIndicator, { color: item.type === 'income' ? Colors.success : Colors.danger }]}>
            {item.type === 'income' ? '↑' : '↓'}
          </Text>
          <Text style={[styles.previewDesc, { flex: 1 }]} numberOfLines={1}>{item.description}</Text>
          <Text style={[styles.previewAmt, { color: item.type === 'income' ? Colors.success : Colors.danger }]}>
            {item.type === 'income' ? '+' : '-'}{brl(item.amount)}
          </Text>
        </View>

        {/* Row 2: merchant badge + date */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {item.merchant ? (
            <View style={styles.merchantBadge}>
              <Text style={styles.merchantBadgeText}>🏪 {item.merchant}</Text>
            </View>
          ) : null}
          <Text style={styles.previewMeta}>{formatDisplayDate(item.date)}</Text>
          {item.installmentTotal > 1 && (
            <View style={styles.installBadge}>
              <Text style={styles.installBadgeText}>{item.installmentTotal}x</Text>
            </View>
          )}
          {item.installmentTotalDetected && item.installmentTotalDetected > 1 && item.billingDate && (
            <View style={[styles.installBadge, item.isSyntheticFuture && { backgroundColor: Colors.lightBlue }]}>
              <Text style={styles.installBadgeText}>
                {item.isSyntheticFuture ? '🔮 ' : ''}fatura {formatDisplayDate(item.billingDate).slice(3)}
              </Text>
            </View>
          )}
        </View>

        {/* Row 3: pote selector — apenas para gastos */}
        {item.type === 'expense' && <View>
          <Text style={styles.previewMeta}>
            {'Pote: '}
            {poteNotFound && (
              <Text style={{ color: Colors.warning }}>"{item.poteName}" não encontrado</Text>
            )}
            {poteFound && (
              <Text style={{ color: Colors.success }}>✓ encontrado</Text>
            )}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            <TouchableOpacity
              style={[styles.potChip, item.potId === null && styles.potChipActive]}
              onPress={() => setRowPot(index, null)}
            >
              <Text style={[styles.potChipText, item.potId === null && styles.potChipTextActive]}>Nenhum</Text>
            </TouchableOpacity>
            {pots.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.potChip, item.potId === p.id && styles.potChipActive]}
                onPress={() => setRowPot(index, p.id)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
                  <Text style={[styles.potChipText, item.potId === p.id && styles.potChipTextActive]}>
                    {getPotIcon(p.name)} {p.name}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>}
      </View>
    )
  }

  const stepTitle = () => {
    if (step === 'pick') return importMode === 'bank_pdf' ? 'Importar Extrato' : 'Importar Planilha'
    if (step === 'preview') return `${rows.length} itens detectados`
    if (step === 'card_select') return 'Selecionar cartão'
    if (step === 'assign') return 'Atribuir potes'
    if (step === 'done') return 'Concluído'
    return 'Salvando...'
  }

  return (
    <>
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{stepTitle()}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {preparingAssign && (
          <View style={[StyleSheet.absoluteFillObject as any, { backgroundColor: Colors.white + 'CC', alignItems: 'center', justifyContent: 'center', zIndex: 10 }]}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={[styles.previewMeta, { marginTop: 12 }]}>Preparando parcelas...</Text>
          </View>
        )}

        {/* STEP: pick */}
        {step === 'pick' && (
          <ScrollView contentContainerStyle={styles.pickContainer} showsVerticalScrollIndicator={false}>
            {/* Segmented control: Excel | Extrato Bancário (PDF) */}
            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segmentBtn, importMode === 'excel' && styles.segmentBtnActive]}
                onPress={() => setImportMode('excel')}
              >
                <Text style={[styles.segmentText, importMode === 'excel' && styles.segmentTextActive]}>
                  Planilha Excel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, importMode === 'bank_pdf' && styles.segmentBtnActive]}
                onPress={() => setImportMode('bank_pdf')}
              >
                <Text style={[styles.segmentText, importMode === 'bank_pdf' && styles.segmentTextActive]}>
                  Extrato Bancário (PDF)
                </Text>
              </TouchableOpacity>
            </View>

            {importMode === 'excel' ? (
              <>
                <Text style={styles.pickEmoji}>📊</Text>
                <Text style={styles.pickTitle}>Arquivo Excel (.xlsx)</Text>

                {/* Template download banner */}
                <View style={styles.templateBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateBannerTitle}>📥 Baixar modelo de exemplo</Text>
                    <Text style={styles.templateBannerSub}>
                      Use como base para preencher seus lançamentos corretamente
                    </Text>
                    {templateSuccess && (
                      <Text style={styles.templateSuccess}>✅ Modelo baixado com sucesso!</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.templateBtn, downloadingTemplate && { opacity: 0.6 }]}
                    onPress={handleDownloadTemplate}
                    disabled={downloadingTemplate}
                  >
                    {downloadingTemplate
                      ? <ActivityIndicator color={Colors.primary} size="small" />
                      : <Text style={styles.templateBtnText}>Baixar</Text>
                    }
                  </TouchableOpacity>
                </View>

                <ExcelPreview />
                <TouchableOpacity style={[styles.primaryBtn, { width: '100%' }]} onPress={pickFile}>
                  <Text style={styles.primaryBtnText}>Escolher arquivo</Text>
                </TouchableOpacity>
              </>
            ) : !isPremium ? (
              <PaywallBanner
                feature="Importar extrato bancário (PDF)"
                description="Extraia todos os lançamentos de um extrato ou fatura em PDF automaticamente com IA — sem digitar. Disponível no plano Premium."
                onUpgrade={() => { handleClose(); router.push('/premium' as any) }}
              />
            ) : (
              <>
                <Text style={styles.pickEmoji}>🏦</Text>
                <Text style={styles.pickTitle}>Extrato bancário em PDF</Text>
                <Text style={styles.hintText}>
                  A IA lê o PDF e extrai os lançamentos. Escolha o tipo do documento:
                </Text>

                {/* Seletor débito/crédito */}
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.potChip, statementType === 'debito' && styles.potChipActive]}
                    onPress={() => setStatementType('debito')}
                  >
                    <Text style={[styles.potChipText, statementType === 'debito' && styles.potChipTextActive]}>
                      Débito / Conta
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.potChip, statementType === 'credito' && styles.potChipActive]}
                    onPress={() => setStatementType('credito')}
                  >
                    <Text style={[styles.potChipText, statementType === 'credito' && styles.potChipTextActive]}>
                      Crédito / Fatura
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { width: '100%' }, (!canPickBankPdf || parsingPdf) && { opacity: 0.5 }]}
                  onPress={pickBankPDF}
                  disabled={!canPickBankPdf || parsingPdf}
                >
                  {parsingPdf
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.primaryBtnText}>Escolher extrato em PDF</Text>
                  }
                </TouchableOpacity>
                {parsingPdf && (
                  <Text style={styles.hintText}>Lendo o extrato com IA… pode levar até 1 minuto.</Text>
                )}
                {!canPickBankPdf && !parsingPdf && (
                  <Text style={styles.hintText}>Selecione o tipo de extrato para continuar.</Text>
                )}
              </>
            )}
          </ScrollView>
        )}

        {/* STEP: preview */}
        {step === 'preview' && (
          <View style={{ flex: 1 }}>
            <View style={styles.filenameBadge}>
              <Text style={styles.filenameText}>📄 {filename}</Text>
              {detectedBank && (
                <Text style={styles.filenameText}>🏦 {detectedBank}</Text>
              )}
            </View>
            <Text style={styles.sectionLabel}>
              Prévia ({rows.length} linhas → {totalTransactions} lançamentos)
            </Text>
            <FlatList
              data={rows}
              keyExtractor={(_, i) => String(i)}
              renderItem={renderPreviewRow}
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
            />
            <View style={styles.bottomRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={reset}>
                <Text style={styles.secondaryBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleConfirmPreview}>
                <Text style={styles.primaryBtnText}>Confirmar itens →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP: card_select */}
        {step === 'card_select' && (
          <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.cardSelectTitle}>💳 Selecionar cartão</Text>
            <Text style={styles.cardSelectSubtitle}>
              Os lançamentos de crédito serão vinculados a este cartão para calcular o vencimento correto de cada parcela.
            </Text>
            {cards.map(card => (
              <TouchableOpacity
                key={card.id}
                onPress={() => enterAssign(card)}
                style={[styles.cardRow,
                  selectedCard?.id === card.id && { borderColor: Colors.primary, backgroundColor: Colors.lightBlue }]}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>💳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{card.name}</Text>
                  <Text style={styles.cardMeta}>
                    Fecha dia {card.closing_day} · Vence dia {card.due_day}
                    {card.last_four ? ` · ****${card.last_four}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {cards.length === 0 && (
              <Text style={[styles.cardMeta, { textAlign: 'center', marginBottom: 16 }]}>
                Nenhum cartão cadastrado. Cadastre em Perfil → Cartões.
              </Text>
            )}
            <TouchableOpacity
              onPress={() => enterAssign(null)}
              style={styles.cardSkipBtn}
            >
              <Text style={{ color: Colors.textMuted, fontSize: 13 }}>Continuar sem vincular cartão</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* STEP: assign */}
        {step === 'assign' && (
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Ajuste o pote por linha ({totalTransactions} lançamentos)</Text>
            {dupSkipped > 0 && (
              <View style={{ backgroundColor: Colors.lightBlue, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: Colors.textDark }}>
                  ℹ️ {dupSkipped} parcela(s) futura(s) já existiam e não foram duplicadas.
                </Text>
              </View>
            )}
            <FlatList
              data={rows}
              keyExtractor={(_, i) => String(i)}
              renderItem={renderAssignRow}
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
            />
            <View style={styles.bottomRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => {
                const hasCreditItems = rows.some(r => r.type === 'expense' && r.paymentMethod === 'credit')
                setStep(hasCreditItems ? 'card_select' : 'preview')
              }}>
                <Text style={styles.secondaryBtnText}>← Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={saveAll}>
                <Text style={styles.primaryBtnText}>Importar {totalTransactions} lançamentos</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP: saving */}
        {step === 'saving' && (
          <View style={styles.centeredContainer}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={[styles.pickTitle, { marginTop: 16 }]}>Salvando lançamentos...</Text>
          </View>
        )}

        {/* STEP: done */}
        {step === 'done' && (
          <View style={styles.centeredContainer}>
            <Text style={styles.pickEmoji}>✅</Text>
            <Text style={styles.pickTitle}>{savedCount} lançamentos importados!</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => { onSuccess(`${savedCount} lançamentos importados!`); handleClose() }}>
              <Text style={styles.primaryBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
    <CreditCardModal
      visible={showCreditCardModal}
      onClose={() => {
        setShowCreditCardModal(false)
        loadCards().then(() => {
          const hasCreditItems = rows.some(r => r.type === 'expense' && r.paymentMethod === 'credit')
          setStep(hasCreditItems ? 'card_select' : 'assign')
        })
      }}
    />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textDark },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: Colors.textMuted },
  pickContainer: { alignItems: 'center', padding: 24, gap: 16 },
  // Segmented control (Excel | Extrato PDF)
  segment: {
    flexDirection: 'row', width: '100%',
    backgroundColor: Colors.background, borderRadius: 12, padding: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentBtnActive: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, textAlign: 'center' },
  segmentTextActive: { color: Colors.primary },
  fieldLabel: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '700', color: Colors.textDark },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', marginTop: -4 },
  hintText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  centeredContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  pickEmoji: { fontSize: 56 },
  pickTitle: { fontSize: 18, fontWeight: '700', color: Colors.textDark, textAlign: 'center' },
  filenameBadge: {
    margin: 16, padding: 10, borderRadius: 8,
    backgroundColor: Colors.lightBlue, alignItems: 'center',
  },
  filenameText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textDark, paddingHorizontal: 16, paddingVertical: 8 },
  previewRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  typeIndicator: { fontSize: 15, fontWeight: '800', width: 18, textAlign: 'center' },
  previewDesc: { fontSize: 13, fontWeight: '500', color: Colors.textDark },
  previewMeta: { fontSize: 11, color: Colors.textMuted },
  previewAmt: { fontSize: 13, fontWeight: '700' },
  removeBtn: { marginLeft: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
  installBadge: {
    backgroundColor: Colors.lightBlue, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  installBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: '700' },
  assignRow: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  assignCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 14, marginHorizontal: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  merchantBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  merchantBadgeText: { fontSize: 11, color: Colors.textMuted },
  potChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
    marginRight: 8,
  },
  potChipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  potChipText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  potChipTextActive: { color: Colors.primary },
  bottomRow: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white,
  },
  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  cardRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, marginBottom: 10,
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  cardMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cardSelectTitle: { fontSize: 18, fontWeight: '700', color: Colors.textDark, marginBottom: 8 },
  cardSelectSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 20, lineHeight: 18 },
  cardSkipBtn: {
    padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', marginTop: 8,
  },

  // Template download banner
  templateBanner: {
    width: '100%',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.primary + '14',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.primary + '28',
  },
  templateBannerTitle: { fontSize: 14, fontWeight: '700', color: Colors.textDark, marginBottom: 3 },
  templateBannerSub: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  templateSuccess: { fontSize: 12, color: Colors.success, fontWeight: '600', marginTop: 4 },
  templateBtn: {
    backgroundColor: Colors.white, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1.5, borderColor: Colors.primary,
    minWidth: 72, alignItems: 'center', justifyContent: 'center',
  },
  templateBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
})
