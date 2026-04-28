import React, { useState } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native'
import { Colors } from '../constants/colors'
import {
  Preset, MonthYear, getPeriodISO, addMonths, monthYearLabel,
  exportTransactionsToExcel,
} from '../lib/export-excel'

const MONTH_FULL = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'ultimos3', label: 'Últimos 3 meses' },
  { key: 'ultimos6', label: 'Últimos 6 meses' },
  { key: 'anoAtual', label: `Ano ${new Date().getFullYear()}` },
  { key: 'anoAnterior', label: `Ano ${new Date().getFullYear() - 1}` },
  { key: 'personalizado', label: 'Personalizado' },
]

type Props = {
  visible: boolean
  onClose: () => void
  userId: string
}

export function ExportExcelModal({ visible, onClose, userId }: Props) {
  const now = new Date()
  const curYear = now.getFullYear()
  const curMonth = now.getMonth() + 1

  const [preset, setPreset] = useState<Preset>('ultimos6')
  const [customStart, setCustomStart] = useState<MonthYear>({ year: curYear, month: Math.max(1, curMonth - 5) })
  const [customEnd, setCustomEnd] = useState<MonthYear>({ year: curYear, month: curMonth })
  const [loading, setLoading] = useState(false)

  function changeStart(delta: number) {
    const next = addMonths(customStart, delta)
    // clamp: at most 24 months back from today, at most equal to customEnd
    const minDate = addMonths({ year: curYear, month: curMonth }, -24)
    const minKey = `${minDate.year}-${String(minDate.month).padStart(2, '0')}`
    const nextKey = `${next.year}-${String(next.month).padStart(2, '0')}`
    const endKey = `${customEnd.year}-${String(customEnd.month).padStart(2, '0')}`
    if (nextKey < minKey || nextKey > endKey) return
    setCustomStart(next)
  }

  function changeEnd(delta: number) {
    const next = addMonths(customEnd, delta)
    const curKey = `${curYear}-${String(curMonth).padStart(2, '0')}`
    const startKey = `${customStart.year}-${String(customStart.month).padStart(2, '0')}`
    const nextKey = `${next.year}-${String(next.month).padStart(2, '0')}`
    if (nextKey > curKey || nextKey < startKey) return
    setCustomEnd(next)
  }

  async function handleExport() {
    setLoading(true)
    try {
      const { startISO, endISO, label } = getPeriodISO(preset, customStart, customEnd)
      await exportTransactionsToExcel(userId, startISO, endISO, label)
      onClose()
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível exportar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>📊 Exportar para Excel</Text>
          <Text style={styles.subtitle}>Abas separadas por mês com todos os lançamentos</Text>

          <Text style={styles.sectionLabel}>PERÍODO</Text>

          <View style={styles.chipsGrid}>
            {PRESETS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.chip, preset === p.key && styles.chipActive]}
                onPress={() => setPreset(p.key)}
              >
                <Text style={[styles.chipText, preset === p.key && styles.chipTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {preset === 'personalizado' && (
            <View style={styles.customPicker}>
              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>De</Text>
                <TouchableOpacity style={styles.arrowBtn} onPress={() => changeStart(-1)}>
                  <Text style={styles.arrowText}>‹</Text>
                </TouchableOpacity>
                <View style={styles.pickerValue}>
                  <Text style={styles.pickerMonth}>{MONTH_FULL[customStart.month - 1]}</Text>
                  <Text style={styles.pickerYear}>{customStart.year}</Text>
                </View>
                <TouchableOpacity style={styles.arrowBtn} onPress={() => changeStart(1)}>
                  <Text style={styles.arrowText}>›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.pickerRow}>
                <Text style={styles.pickerLabel}>Até</Text>
                <TouchableOpacity style={styles.arrowBtn} onPress={() => changeEnd(-1)}>
                  <Text style={styles.arrowText}>‹</Text>
                </TouchableOpacity>
                <View style={styles.pickerValue}>
                  <Text style={styles.pickerMonth}>{MONTH_FULL[customEnd.month - 1]}</Text>
                  <Text style={styles.pickerYear}>{customEnd.year}</Text>
                </View>
                <TouchableOpacity style={styles.arrowBtn} onPress={() => changeEnd(1)}>
                  <Text style={styles.arrowText}>›</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {preset !== 'personalizado' && (
            <View style={styles.periodPreview}>
              <Text style={styles.periodPreviewText}>
                {(() => {
                  const { startISO, endISO } = getPeriodISO(preset, customStart, customEnd)
                  const s = startISO.substring(0, 7).split('-')
                  const e = endISO.substring(0, 7).split('-')
                  return `${MONTH_FULL[Number(s[1]) - 1]} ${s[0]} → ${MONTH_FULL[Number(e[1]) - 1]} ${e[0]}`
                })()}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.exportBtn, loading && styles.exportBtnDisabled]}
            onPress={handleExport}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.exportBtnText}>Exportar Excel</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 20,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.5, marginBottom: 10,
  },
  chipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.lightBlue,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  customPicker: {
    backgroundColor: Colors.background, borderRadius: 14,
    padding: 16, gap: 12, marginBottom: 16,
  },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  pickerLabel: {
    fontSize: 13, fontWeight: '700', color: Colors.textMuted,
    width: 30,
  },
  arrowBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  arrowText: { fontSize: 20, color: Colors.primary, lineHeight: 24 },
  pickerValue: {
    flex: 1, alignItems: 'center',
  },
  pickerMonth: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  pickerYear: { fontSize: 12, color: Colors.textMuted },
  periodPreview: {
    backgroundColor: Colors.lightBlue, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16,
  },
  periodPreviewText: {
    fontSize: 13, fontWeight: '600', color: Colors.primary, textAlign: 'center',
  },
  exportBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  exportBtnDisabled: { opacity: 0.6 },
  exportBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
})
