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

type ImportRow = {
  date: string
  description: string
  merchant: string
  amount: number
  type: 'expense' | 'income'
  paymentMethod: string
  installmentTotal: number
  potId: string | null
}

type Step = 'pick' | 'preview' | 'card_select' | 'assign' | 'saving' | 'done'

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

function parseDateISO(raw: any): string {
  const today = new Date().toISOString().split('T')[0]
  if (!raw) return today
  // Excel serial date (number)
  if (typeof raw === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(raw)
      if (d && d.y > 1900) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    } catch {}
    // Fallback: Excel epoch (days since 1900-01-01, offset 2 for Excel bug)
    const ms = (raw - 25569) * 86400 * 1000
    const dt = new Date(ms)
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0]
    return today
  }
  const s = String(raw).trim()
  // DD/MM/YYYY or D/M/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  // DD/MM/YY (2-digit year)
  const dmy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (dmy2) return `20${dmy2[3]}-${dmy2[2].padStart(2, '0')}-${dmy2[1].padStart(2, '0')}`
  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return today
}

function parseAmount(raw: any): number {
  if (typeof raw === 'number') return Math.abs(raw)
  const s = String(raw).replace(/[R$\s]/g, '').replace(',', '.')
  return Math.abs(parseFloat(s) || 0)
}

function normalize(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parsePaymentMethod(raw: any): string {
  const s = normalize(String(raw ?? ''))
  if (s.includes('cred')) return 'credit'
  if (s.includes('deb')) return 'debit'
  if (s === 'pix' || s.includes('pix')) return 'pix'
  if (s.includes('dinh') || s.includes('cash')) return 'cash'
  if (s.includes('transf')) return 'transfer'
  return 'cash'  // 'other' is not a valid payment_method in the DB
}

function parseType(raw: any): 'expense' | 'income' {
  const s = normalize(String(raw ?? ''))
  if (s.includes('recei') || s === 'income') return 'income'
  return 'expense'  // despesa, gasto, expense → expense
}

// Same logic as NewExpenseModal
function calcBillingDate(txISO: string, card: CreditCard, offset = 0): string {
  const [y, m, d] = txISO.split('-').map(Number)
  let month0 = m - 1
  let year = y
  if (d >= card.closing_day) month0 += 1
  if (card.due_day < card.closing_day) month0 += 1
  month0 += offset
  while (month0 > 11) { month0 -= 12; year += 1 }
  return new Date(year, month0, card.due_day).toISOString().split('T')[0]
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
    }
  }).filter(r => r.amount > 0)
}

// --- Excel preview (static model) ---

const EXCEL_COLS = [
  { label: 'tipo', width: 60 },
  { label: 'descrição', width: 110 },
  { label: 'data', width: 80 },
  { label: 'valor', width: 80 },
  { label: 'pagamento', width: 90 },
  { label: 'estabelecimento', width: 110 },
  { label: 'parcelas', width: 70 },
]

const EXCEL_SAMPLE = [
  ['despesa', 'Supermercado', '15/04/2026', '158,90', 'débito', 'Pão de Açúcar', '1'],
  ['despesa', 'Celular novo', '10/04/2026', '1200,00', 'crédito', 'Samsung Store', '12'],
  ['receita', 'Salário', '05/04/2026', '4500,00', 'pix', 'Empresa XYZ', ''],
]

function ExcelPreview() {
  return (
    <View style={exStyles.wrapper}>
      <Text style={exStyles.label}>Modelo de planilha esperado:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={exStyles.headerRow}>
            {EXCEL_COLS.map(col => (
              <View key={col.label} style={[exStyles.cell, exStyles.headerCell, { width: col.width }]}>
                <Text style={exStyles.headerText}>{col.label}</Text>
              </View>
            ))}
          </View>
          {EXCEL_SAMPLE.map((vals, i) => {
            const bg = i % 2 === 0 ? '#fff' : '#f0f7f0'
            const tipoColor = vals[0] === 'despesa' ? Colors.danger : Colors.success
            return (
              <View key={i} style={[exStyles.dataRow, { backgroundColor: bg }]}>
                {EXCEL_COLS.map((col, ci) => (
                  <View key={col.label} style={[exStyles.cell, { width: col.width }]}>
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
          <Text style={{ fontWeight: '700' }}>Obrigatória:</Text> valor{'\n'}
          <Text style={{ fontWeight: '700' }}>Opcionais:</Text> tipo, descrição, data, pagamento, estabelecimento, parcelas
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
    setStep('pick'); setRows([]); setFilename(''); setSelectedCard(null)
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
      const parsed = parseSheet(data)
      if (parsed.length === 0) {
        Alert.alert('Arquivo vazio', 'Não encontramos transações válidas. Verifique o formato do arquivo.')
        return
      }
      setRows(parsed)
      setStep('preview')
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível abrir o arquivo.')
    }
  }

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx))

  const setRowPot = (idx: number, potId: string | null) => {
    setRows(prev => { const next = [...prev]; next[idx] = { ...next[idx], potId }; return next })
  }

  const handleConfirmPreview = () => {
    const hasCreditItems = rows.some(r => r.type === 'expense' && r.paymentMethod === 'credit')
    setStep(hasCreditItems ? 'card_select' : 'assign')
  }

  const saveAll = async () => {
    setStep('saving')
    try {
      // Verify userId from live auth session — prop may be stale
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const resolvedUserId = authUser?.id ?? userId
      console.log('[Import] userId prop:', userId, '| auth.getUser():', authUser?.id, '| match:', userId === authUser?.id)
      if (!resolvedUserId) {
        Alert.alert('Erro', 'Usuário não autenticado.')
        setStep('assign')
        return
      }

      const inserts: any[] = []

      for (const r of rows) {
        const installments = r.installmentTotal
        const isCredit = r.paymentMethod === 'credit'
        const installmentValue = Math.round((r.amount / installments) * 100) / 100
        const groupId = installments > 1 ? genUUID() : null

        for (let i = 0; i < installments; i++) {
          let billingDate: string | null = null
          if (isCredit) {
            if (selectedCard) {
              billingDate = calcBillingDate(r.date, selectedCard, i)
            } else {
              // No card selected: billing_date = next month + offset
              const [y, mo, d] = r.date.split('-').map(Number)
              const dt = new Date(y, mo - 1 + 1 + i, d)
              billingDate = dt.toISOString().split('T')[0]
            }
          }

          inserts.push({
            user_id: resolvedUserId,
            pot_id: r.potId,
            card_id: (isCredit && selectedCard) ? selectedCard.id : null,
            type: r.type,
            amount: installmentValue,
            description: installments > 1
              ? `${r.description} (${i + 1}/${installments})`
              : r.description,
            merchant: r.merchant || null,
            date: r.date,
            billing_date: billingDate,
            payment_method: r.paymentMethod,
            is_need: null,
            installment_total: installments > 1 ? installments : null,
            installment_number: installments > 1 ? i + 1 : null,
            installment_group_id: groupId,
          })
        }
      }

      // Validate before insert — log first row for diagnosis
      const sample = inserts[0]
      console.log('[Import] Sample row to insert:', JSON.stringify({
        type: sample?.type,
        payment_method: sample?.payment_method,
        date: sample?.date,
        billing_date: sample?.billing_date,
        amount: sample?.amount,
        pot_id: sample?.pot_id,
      }))
      const invalidType = inserts.find(t => !['expense', 'income', 'goal_deposit'].includes(t.type))
      const invalidPay  = inserts.find(t => !['credit', 'debit', 'pix', 'cash', 'transfer'].includes(t.payment_method))
      const invalidDate = inserts.find(t => !t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date))
      if (invalidType) console.error('[Import] INVALID type:', invalidType.type, invalidType.description)
      if (invalidPay)  console.error('[Import] INVALID payment_method:', invalidPay.payment_method, invalidPay.description)
      if (invalidDate) console.error('[Import] INVALID date:', invalidDate.date, invalidDate.description)

      const { data: inserted, error } = await supabase.from('transactions').insert(inserts).select()
      if (error) throw error
      console.log('[Import] Inserted count:', inserted?.length, '| error:', error)
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

  const renderAssignRow = ({ item, index }: { item: ImportRow; index: number }) => (
    <View style={styles.assignRow}>
      <View style={{ flex: 1, marginBottom: 4 }}>
        <Text style={styles.previewDesc} numberOfLines={1}>{item.description}</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 }}>
          <Text style={styles.previewMeta}>{item.date} · {item.type === 'income' ? '+' : '-'}{brl(item.amount)}</Text>
          {item.installmentTotal > 1 && (
            <View style={styles.installBadge}>
              <Text style={styles.installBadgeText}>{item.installmentTotal}x</Text>
            </View>
          )}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        <TouchableOpacity
          style={[styles.potChip, item.potId === null && styles.potChipActive]}
          onPress={() => setRowPot(index, null)}
        >
          <Text style={[styles.potChipText, item.potId === null && styles.potChipTextActive]}>Nenhum</Text>
        </TouchableOpacity>
        {pots.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.potChip, item.potId === p.id && styles.potChipActive, { borderColor: p.color }]}
            onPress={() => setRowPot(index, p.id)}
          >
            <Text style={[styles.potChipText, item.potId === p.id && { color: p.color }]}>
              {getPotIcon(p.name)} {p.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )

  const stepTitle = () => {
    if (step === 'pick') return 'Importar Planilha'
    if (step === 'preview') return `${rows.length} itens detectados`
    if (step === 'card_select') return 'Selecionar cartão'
    if (step === 'assign') return 'Atribuir potes'
    if (step === 'done') return 'Concluído'
    return 'Salvando...'
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{stepTitle()}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* STEP: pick */}
        {step === 'pick' && (
          <ScrollView contentContainerStyle={styles.pickContainer} showsVerticalScrollIndicator={false}>
            <Text style={styles.pickEmoji}>📊</Text>
            <Text style={styles.pickTitle}>Arquivo Excel (.xlsx)</Text>
            <ExcelPreview />
            <TouchableOpacity style={[styles.primaryBtn, { width: '100%' }]} onPress={pickFile}>
              <Text style={styles.primaryBtnText}>Escolher arquivo</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* STEP: preview */}
        {step === 'preview' && (
          <View style={{ flex: 1 }}>
            <View style={styles.filenameBadge}>
              <Text style={styles.filenameText}>📄 {filename}</Text>
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
                onPress={() => { setSelectedCard(card); setStep('assign') }}
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
              onPress={() => { setSelectedCard(null); setStep('assign') }}
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
})
