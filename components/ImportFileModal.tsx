import React, { useState } from 'react'
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
import { Pot } from '../types'

type ImportRow = {
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  potId: string | null
  installmentTotal: number  // 1 = à vista
}

type Step = 'pick' | 'preview' | 'assign' | 'saving' | 'done'

type Props = {
  visible: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  pots: Pot[]
  userId: string
  cycleStartISO: string
  cycleEndISO: string
}

function parseDate(raw: any): string {
  if (!raw) return new Date().toISOString().split('T')[0]
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return new Date().toISOString().split('T')[0]
}

function parseAmount(raw: any): number {
  if (typeof raw === 'number') return Math.abs(raw)
  const s = String(raw).replace(/[R$\s]/g, '').replace(',', '.')
  return Math.abs(parseFloat(s) || 0)
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

  const dateCol    = colIdx(['data', 'date'])
  const descCol    = colIdx(['descri', 'desc', 'hist', 'memo'])
  const amtCol     = colIdx(['valor', 'amount', 'value', 'total'])
  const typeCol    = colIdx(['tipo', 'type'])
  const installCol = colIdx(['parcela', 'parcel', 'installment'])

  if (amtCol < 0) return []

  return data.slice(1).filter(row => row[amtCol] != null).map(row => {
    const rawAmt = row[amtCol]
    const amount = parseAmount(rawAmt)
    const type: 'expense' | 'income' = typeCol >= 0
      ? (String(row[typeCol] ?? '').toLowerCase().includes('recei') ? 'income' : 'expense')
      : (typeof rawAmt === 'number' && rawAmt < 0 ? 'income' : 'expense')
    const installmentTotal = installCol >= 0
      ? (parseInt(String(row[installCol] ?? '1')) || 1)
      : 1
    return {
      date: parseDate(dateCol >= 0 ? row[dateCol] : null),
      description: descCol >= 0 ? String(row[descCol] ?? '').trim() : 'Importado',
      amount,
      type,
      potId: null,
      installmentTotal: type === 'expense' ? installmentTotal : 1,
    }
  }).filter(r => r.amount > 0)
}

export function ImportFileModal({ visible, onClose, onSuccess, pots, userId, cycleStartISO, cycleEndISO }: Props) {
  const [step, setStep] = useState<Step>('pick')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [filename, setFilename] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  const reset = () => { setStep('pick'); setRows([]); setFilename('') }
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

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  const setRowPot = (idx: number, potId: string | null) => {
    setRows(prev => { const next = [...prev]; next[idx] = { ...next[idx], potId }; return next })
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      const inserts: any[] = []

      for (const r of rows) {
        if (r.installmentTotal > 1) {
          const groupId = genUUID()
          const installmentValue = Math.round((r.amount / r.installmentTotal) * 100) / 100
          for (let i = 0; i < r.installmentTotal; i++) {
            inserts.push({
              user_id: userId,
              pot_id: r.potId,
              date: r.date,
              description: `${r.description} (${i + 1}/${r.installmentTotal})`,
              amount: installmentValue,
              type: r.type,
              payment_method: 'credit',
              installment_total: r.installmentTotal,
              installment_number: i + 1,
              installment_group_id: groupId,
            })
          }
        } else {
          inserts.push({
            user_id: userId,
            pot_id: r.potId,
            date: r.date,
            description: r.description,
            amount: r.amount,
            type: r.type,
            payment_method: 'other',
          })
        }
      }

      const { error } = await supabase.from('transactions').insert(inserts)
      if (error) throw error
      setSavedCount(inserts.length)
      setStep('done')
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e?.message ?? 'Tente novamente.')
    } finally {
      setSaving(false)
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
        <Text style={styles.previewMeta}>{item.date}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Text style={[styles.previewAmt, { color: item.type === 'income' ? Colors.success : Colors.danger }]}>
          {item.type === 'income' ? '+' : '-'}{brl(item.amount)}
        </Text>
        {item.installmentTotal > 1 && (
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {step === 'pick' ? 'Importar Planilha' :
             step === 'preview' ? `${rows.length} itens detectados` :
             step === 'assign' ? 'Atribuir potes' :
             step === 'done' ? 'Concluído' : 'Salvando...'}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* STEP: pick */}
        {step === 'pick' && (
          <View style={styles.pickContainer}>
            <Text style={styles.pickEmoji}>📊</Text>
            <Text style={styles.pickTitle}>Arquivo Excel (.xlsx)</Text>

            <View style={styles.colReference}>
              <Text style={styles.colRefTitle}>Colunas esperadas no arquivo:</Text>
              <Text style={styles.colRefCode}>
                tipo | descrição | data | valor |{'\n'}
                pagamento | estabelecimento | parcelas
              </Text>
              <Text style={styles.colRefNote}>
                * parcelas: número inteiro (ex: 3 = 3x).{'\n'}
                * Deixar vazio ou 1 para compra à vista.
              </Text>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={pickFile}>
              <Text style={styles.primaryBtnText}>Escolher arquivo</Text>
            </TouchableOpacity>
          </View>
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
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => setStep('assign')}>
                <Text style={styles.primaryBtnText}>Confirmar itens →</Text>
              </TouchableOpacity>
            </View>
          </View>
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
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('preview')}>
                <Text style={styles.secondaryBtnText}>← Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={saveAll} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Importar {totalTransactions} lançamentos</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP: done */}
        {step === 'done' && (
          <View style={styles.pickContainer}>
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
  pickContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  pickEmoji: { fontSize: 56 },
  pickTitle: { fontSize: 18, fontWeight: '700', color: Colors.textDark, textAlign: 'center' },
  colReference: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    width: '100%', borderWidth: 1, borderColor: Colors.border,
  },
  colRefTitle: { fontSize: 12, fontWeight: '700', color: Colors.textDark, marginBottom: 6 },
  colRefCode: { fontSize: 11, color: Colors.textMuted, fontFamily: 'monospace', lineHeight: 18 },
  colRefNote: { fontSize: 11, color: Colors.textMuted, marginTop: 6, lineHeight: 16 },
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
  potScroll: { paddingHorizontal: 12, paddingVertical: 8 },
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
})
