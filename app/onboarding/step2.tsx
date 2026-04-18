import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Switch,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../../constants/colors'
import {
  onboardingDraft,
  IncomeSourceDraft,
  formatCents,
  digitsOnly,
  centsToFloat,
} from '../../lib/onboardingDraft'
import { IncomeSource } from '../../types'

// --- Dados de apoio ---
type IncomeType = IncomeSource['type']

const INCOME_TYPES: { key: IncomeType; label: string }[] = [
  { key: 'salary', label: 'Salário' },
  { key: 'freelance', label: 'Freelance' },
  { key: 'rent', label: 'Aluguel' },
  { key: 'dividend', label: 'Dividendos' },
  { key: 'other', label: 'Outro' },
]

const TYPE_LABEL: Record<IncomeType, string> = {
  salary: 'Salário',
  freelance: 'Freelance',
  rent: 'Aluguel',
  dividend: 'Dividendos',
  other: 'Outro',
}

// --- Ícone calendário (Views puras) ---
function CalendarIcon() {
  return (
    <View style={iconStyles.calendar}>
      <View style={iconStyles.calHeader}>
        <View style={iconStyles.calPin} />
        <View style={iconStyles.calPin} />
      </View>
      <View style={iconStyles.calBody}>
        {[0, 1].map((row) => (
          <View key={row} style={iconStyles.calRow}>
            {[0, 1, 2, 3].map((col) => (
              <View key={col} style={iconStyles.calDot} />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

// --- Componente principal ---
export default function Step2() {
  const insets = useSafeAreaInsets()

  // Ciclo
  const [cycleMode, setCycleMode] = useState<'default' | 'custom'>('default')
  const [customDay, setCustomDay] = useState('5')

  // Lista de fontes já adicionadas (lidas do draft)
  const [sources, setSources] = useState<IncomeSourceDraft[]>(() => onboardingDraft.get().incomeSources)

  // Modal state
  const [modalVisible, setModalVisible] = useState(false)
  const [novaFonte, setNovaFonte] = useState({
    name: '',
    type: 'salary' as IncomeType,
    amountDigits: '',
    day: '5',
    is_primary: false,
  })
  const [mError, setMError] = useState<string | null>(null)

  const cycleStart = cycleMode === 'default' ? 1 : Math.min(31, Math.max(1, parseInt(customDay) || 1))

  const openModal = () => {
    setNovaFonte({ name: '', type: 'salary', amountDigits: '', day: '5', is_primary: sources.length === 0 })
    setMError(null)
    setModalVisible(true)
  }

  const handleAdicionarFonte = () => {
    if (!novaFonte.name.trim()) { setMError('Informe o nome da receita.'); return }
    const amount = centsToFloat(novaFonte.amountDigits)
    if (amount <= 0) { setMError('Informe um valor maior que zero.'); return }
    const day = parseInt(novaFonte.day) || 1
    if (day < 1 || day > 31) { setMError('Dia inválido (1–31).'); return }

    const newSource: IncomeSourceDraft = {
      name: novaFonte.name.trim(),
      type: novaFonte.type,
      amount,
      recurrence_day: day,
      is_primary: novaFonte.is_primary,
    }

    onboardingDraft.addSource(newSource)
    setSources(onboardingDraft.get().incomeSources)
    setModalVisible(false)
  }

  const removeSource = (index: number) => {
    onboardingDraft.removeSource(index)
    setSources(onboardingDraft.get().incomeSources)
  }

  const handleContinue = () => {
    onboardingDraft.set({ cycleStart })
    router.push('/onboarding/step3')
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Barra de progresso */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: '66%' }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          {/* Ícone da etapa */}
          <View style={styles.iconWrap}>
            <CalendarIcon />
          </View>

          <Text style={styles.stepLabel}>Passo 2 de 3</Text>
          <Text style={styles.title}>Defina seu ciclo mensal</Text>
          <Text style={styles.subtitle}>Quando começa seu mês financeiro?</Text>

          {/* Seletor de ciclo */}
          <View style={styles.cycleToggle}>
            <TouchableOpacity
              style={[styles.cycleBtn, cycleMode === 'default' && styles.cycleBtnActive]}
              onPress={() => setCycleMode('default')}
              activeOpacity={0.75}
            >
              <Text style={[styles.cycleBtnText, cycleMode === 'default' && styles.cycleBtnTextActive]}>
                Padrão (dia 01)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cycleBtn, cycleMode === 'custom' && styles.cycleBtnActive]}
              onPress={() => setCycleMode('custom')}
              activeOpacity={0.75}
            >
              <Text style={[styles.cycleBtnText, cycleMode === 'custom' && styles.cycleBtnTextActive]}>
                Personalizado
              </Text>
            </TouchableOpacity>
          </View>

          {cycleMode === 'custom' && (
            <View style={styles.customDayRow}>
              <Text style={styles.label}>Começa no dia:</Text>
              <TextInput
                style={styles.dayInput}
                value={customDay}
                onChangeText={(t) => setCustomDay(digitsOnly(t, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="1"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
              />
            </View>
          )}

          {/* Seção fontes de receita */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Fontes de receita</Text>
            <Text style={styles.sectionHint}>opcional</Text>
          </View>

          {sources.length === 0 ? (
            <View style={styles.emptyIncome}>
              <Text style={styles.emptyIncomeText}>Nenhuma fonte adicionada ainda</Text>
            </View>
          ) : (
            sources.map((s, idx) => (
              <View key={idx} style={styles.incomeItem}>
                <View style={styles.incomeLeft}>
                  <Text style={styles.incomeName}>{s.name}</Text>
                  <Text style={styles.incomeMeta}>
                    {TYPE_LABEL[s.type]} · Dia {s.recurrence_day}
                    {s.is_primary ? ' · Principal' : ''}
                  </Text>
                </View>
                <View style={styles.incomeRight}>
                  <Text style={styles.incomeAmount}>R$ {s.amount.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeSource(idx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity style={styles.addIncomeBtn} onPress={openModal} activeOpacity={0.75}>
            <Text style={styles.addIncomePlus}>+</Text>
            <Text style={styles.addIncomeText}>Adicionar fonte de receita</Text>
          </TouchableOpacity>
      </ScrollView>

      {/* Botão fixo no rodapé */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.btn} onPress={handleContinue} activeOpacity={0.85}>
          <Text style={styles.btnText}>Continuar</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de adição de receita */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalKav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Overlay: fecha o modal ao tocar fora */}
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />

          {/* Sheet: irmão do overlay, não filho */}
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Adicionar receita</Text>

            <Text style={styles.modalLabel}>Nome</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Salário, Freelance…"
              placeholderTextColor={Colors.textMuted}
              value={novaFonte.name}
              onChangeText={(t) => { setNovaFonte(f => ({ ...f, name: t })); setMError(null) }}
              autoFocus
            />

            <Text style={styles.modalLabel}>Tipo</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.typeRow}
            >
              {INCOME_TYPES.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.typeChip, novaFonte.type === key && styles.typeChipActive]}
                  onPress={() => setNovaFonte(f => ({ ...f, type: key }))}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.typeChipText, novaFonte.type === key && styles.typeChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalRow}>
              <View style={styles.modalHalf}>
                <Text style={styles.modalLabel}>Valor mensal</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="R$ 0,00"
                  placeholderTextColor={Colors.textMuted}
                  value={formatCents(novaFonte.amountDigits)}
                  onChangeText={(t) => { setNovaFonte(f => ({ ...f, amountDigits: digitsOnly(t) })); setMError(null) }}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.modalSmall}>
                <Text style={styles.modalLabel}>Dia</Text>
                <TextInput
                  style={[styles.modalInput, styles.dayInputModal]}
                  placeholder="5"
                  placeholderTextColor={Colors.textMuted}
                  value={novaFonte.day}
                  onChangeText={(t) => setNovaFonte(f => ({ ...f, day: digitsOnly(t, 2) }))}
                  keyboardType="number-pad"
                  maxLength={2}
                  textAlign="center"
                />
              </View>
            </View>

            <View style={styles.primaryRow}>
              <Text style={styles.primaryLabel}>Receita principal</Text>
              <Switch
                value={novaFonte.is_primary}
                onValueChange={(v) => setNovaFonte(f => ({ ...f, is_primary: v }))}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>

            {mError && <Text style={styles.modalError}>{mError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAdicionarFonte}>
                <Text style={styles.modalSaveText}>Adicionar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const iconStyles = StyleSheet.create({
  calendar: { width: 44, height: 40 },
  calHeader: {
    height: 10,
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingTop: 0,
  },
  calPin: {
    width: 4,
    height: 8,
    backgroundColor: Colors.white,
    borderRadius: 2,
    marginTop: -3,
  },
  calBody: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: Colors.primary,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    padding: 4,
    gap: 4,
  },
  calRow: { flexDirection: 'row', justifyContent: 'space-around' },
  calDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.border },
})

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  progressTrack: { height: 4, backgroundColor: Colors.border },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },

  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 32, paddingBottom: 16 },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.lightBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  stepLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textDark, marginBottom: 10, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, color: Colors.textMuted, lineHeight: 22, marginBottom: 28 },

  // Seletor de ciclo
  cycleToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cycleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cycleBtnActive: { backgroundColor: Colors.primary },
  cycleBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  cycleBtnTextActive: { color: Colors.white },

  customDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  dayInput: {
    width: 60,
    backgroundColor: Colors.white,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },

  // Seção receitas
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  sectionHint: {
    fontSize: 11,
    color: Colors.textMuted,
    backgroundColor: Colors.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },

  emptyIncome: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyIncomeText: { fontSize: 14, color: Colors.textMuted },

  incomeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  incomeLeft: { flex: 1 },
  incomeName: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  incomeMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  incomeRight: { alignItems: 'flex-end', gap: 4 },
  incomeAmount: { fontSize: 14, fontWeight: '700', color: Colors.success },
  removeBtn: { padding: 2 },
  removeBtnText: { fontSize: 14, color: Colors.textMuted },

  addIncomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    marginBottom: 8,
  },
  addIncomePlus: { fontSize: 20, color: Colors.primary, fontWeight: '700', lineHeight: 22 },
  addIncomeText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  // Botão rodapé
  bottomBar: {
    paddingHorizontal: 28,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  // Modal
  modalKav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textDark, marginBottom: 20 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6, marginTop: 4 },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textDark,
    marginBottom: 4,
  },
  dayInputModal: { textAlign: 'center', fontWeight: '700' },
  modalRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  modalHalf: { flex: 1 },
  modalSmall: { width: 72 },

  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 8, paddingRight: 4 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  typeChipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  typeChipText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  typeChipTextActive: { color: Colors.primary },

  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 8,
  },
  primaryLabel: { fontSize: 14, fontWeight: '600', color: Colors.textDark },

  modalError: { fontSize: 13, color: Colors.danger, marginTop: 4, marginBottom: 4 },

  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textMuted },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: Colors.white },
})
