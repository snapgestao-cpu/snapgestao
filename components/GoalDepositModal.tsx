import React, { useState, useEffect } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { Goal, Pot } from '../types'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { formatCents, digitsOnly, centsToFloat } from '../lib/onboardingDraft'
import { brl } from '../lib/finance'
import { getPotIcon } from '../lib/potIcons'
import { getCycle } from '../lib/cycle'

type Props = {
  visible: boolean
  goal: Goal | null
  onClose: () => void
  onSuccess: (message: string) => void
}

export function GoalDepositModal({ visible, goal, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets()

  const [amountDigits, setAmountDigits] = useState('')
  const [pots, setPots] = useState<Pot[]>([])
  const [selectedPotId, setSelectedPotId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cycleBalance, setCycleBalance] = useState<number | null>(null)
  const [cycleLabel, setCycleLabel] = useState('')

  const { user } = useAuthStore()

  useEffect(() => {
    if (!visible) return
    setAmountDigits('')
    setSelectedPotId(null)
    setError(null)
    setCycleBalance(null)

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) return

    supabase.from('pots').select('*').eq('user_id', userId)
      .then(({ data }) => setPots((data as Pot[]) ?? []))

    // Fetch cycle balance for warning
    if (user) {
      const cycle = getCycle(user.cycle_start ?? 1, 0)
      setCycleLabel(cycle.monthYear)
      Promise.all([
        supabase.from('income_sources').select('amount').eq('user_id', userId),
        supabase.from('transactions').select('type,amount')
          .eq('user_id', userId)
          .gte('date', cycle.startISO).lte('date', cycle.endISO),
      ]).then(([srcRes, txRes]) => {
        const baseIncome = ((srcRes.data ?? []) as any[])
          .reduce((s, r) => s + Number(r.amount), 0)
        const txs = (txRes.data ?? []) as any[]
        const extraIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
        const expense = txs.filter(t => t.type === 'expense' || t.type === 'goal_deposit')
          .reduce((s, t) => s + Number(t.amount), 0)
        setCycleBalance(baseIncome + extraIncome - expense)
      })
    }
  }, [visible])

  const handleSave = async () => {
    const amount = centsToFloat(amountDigits)
    if (amount <= 0) { setError('Informe um valor maior que zero.'); return }
    if (!goal) return

    const userId = useAuthStore.getState().session?.user?.id
    if (!userId) { setError('Sessão inválida.'); return }

    setError(null)
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      // Insert goal_deposit transaction
      const { error: txErr } = await supabase.from('transactions').insert({
        user_id: userId,
        pot_id: selectedPotId,
        card_id: null,
        type: 'goal_deposit',
        amount,
        description: `Depósito: ${goal.name}`,
        merchant: null,
        date: today,
        billing_date: null,
        payment_method: 'transfer',
        is_need: null,
      })
      if (txErr) { setError('Erro ao registrar: ' + txErr.message); return }

      // Update goal current_amount
      const newAmount = goal.current_amount + amount
      const { error: goalErr } = await supabase
        .from('goals')
        .update({ current_amount: newAmount })
        .eq('id', goal.id)
      if (goalErr) { setError('Erro ao atualizar meta: ' + goalErr.message); return }

      onSuccess('Depósito registrado!')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  if (!goal) return null

  const progress = goal.target_amount > 0
    ? Math.min((goal.current_amount + centsToFloat(amountDigits)) / goal.target_amount, 1)
    : 0

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
            <Text style={styles.headerTitle}>Depositar na meta</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Meta info */}
            <View style={styles.goalInfo}>
              <Text style={styles.goalName}>🎯 {goal.name}</Text>
              <Text style={styles.goalProgress}>
                {brl(goal.current_amount)} de {brl(goal.target_amount)}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            </View>

            {/* Valor */}
            <TextInput
              style={styles.amountInput}
              value={formatCents(amountDigits)}
              onChangeText={t => { setAmountDigits(digitsOnly(t)); setError(null) }}
              keyboardType="numeric"
              placeholder="R$ 0,00"
              placeholderTextColor={Colors.textMuted}
              textAlign="center"
            />

            {/* Warning card */}
            <View style={styles.warningCard}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.warningTitle}>Este valor sairá do mês corrente</Text>
                <Text style={styles.warningText}>
                  {centsToFloat(amountDigits) > 0
                    ? `${brl(centsToFloat(amountDigits))} será descontado do ciclo de ${cycleLabel}`
                    : `O valor será descontado do ciclo de ${cycleLabel}`
                  }
                </Text>
                {cycleBalance !== null && (
                  <Text style={styles.warningBalance}>
                    Saldo disponível: {brl(cycleBalance)}
                  </Text>
                )}
              </View>
            </View>

            {/* De qual pote? */}
            <Text style={styles.label}>De qual pote? <Text style={styles.optional}>(opcional)</Text></Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <TouchableOpacity
                style={[styles.chip, selectedPotId === null && styles.chipActive]}
                onPress={() => setSelectedPotId(null)}
              >
                <Text style={[styles.chipText, selectedPotId === null && styles.chipTextActive]}>
                  Saldo livre
                </Text>
              </TouchableOpacity>
              {pots.map(pot => (
                <TouchableOpacity
                  key={pot.id}
                  style={[styles.chip, selectedPotId === pot.id && styles.chipActive]}
                  onPress={() => setSelectedPotId(pot.id)}
                >
                  <Text style={[styles.chipText, selectedPotId === pot.id && styles.chipTextActive]}>
                    {getPotIcon(pot.name)} {pot.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠ {error}</Text>
              </View>
            ) : null}

            <View style={{ height: 8 }} />
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Confirmar depósito</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textDark },
  closeIcon: { fontSize: 18, color: Colors.textMuted },
  goalInfo: {
    backgroundColor: Colors.lightBlue, borderRadius: 12,
    padding: 14, marginBottom: 16,
  },
  goalName: { fontSize: 15, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },
  goalProgress: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  progressTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  amountInput: {
    fontSize: 36, fontWeight: '800', color: Colors.textDark,
    textAlign: 'center', paddingVertical: 16,
    borderBottomWidth: 2, borderBottomColor: Colors.primary, marginBottom: 20,
  },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6 },
  optional: { fontWeight: '400', color: Colors.textMuted },
  chipScroll: { marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background, marginRight: 8,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  warningCard: {
    backgroundColor: '#FEF4E4', borderWidth: 0.5, borderColor: '#FAC775',
    borderRadius: 10, padding: 12, marginBottom: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  warningIcon: { fontSize: 16 },
  warningTitle: { fontSize: 13, fontWeight: '600', color: '#B7700E', marginBottom: 3 },
  warningText: { fontSize: 12, color: '#B7700E' },
  warningBalance: { fontSize: 12, color: '#B7700E', marginTop: 4, fontWeight: '500' },
  errorBox: {
    backgroundColor: Colors.lightRed, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8,
  },
  errorText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
