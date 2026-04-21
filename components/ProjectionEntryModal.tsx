import React, { useState, useEffect } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import { getCycle } from '../lib/cycle'

export type ProjectionEntry = {
  id: string
  user_id: string
  type: 'income' | 'expense'
  description: string
  amount: number
  entry_date: string
  cycle_start_date: string
  is_recurring: boolean
  created_at: string
}

type Props = {
  visible: boolean
  initialType?: 'income' | 'expense'
  onClose: () => void
  onSuccess: () => void
  entry?: ProjectionEntry
}

function digitsOnly(s: string) { return s.replace(/\D/g, '') }
function formatCents(digits: string): string {
  const n = parseInt(digits || '0', 10)
  return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function centsToFloat(digits: string): number {
  return parseInt(digits || '0', 10) / 100
}

export default function ProjectionEntryModal({ visible, initialType = 'income', onClose, onSuccess, entry }: Props) {
  const { user } = useAuthStore()
  const [type, setType] = useState<'income' | 'expense'>(initialType)
  const [description, setDescription] = useState('')
  const [amountCents, setAmountCents] = useState('0')
  const [selectedOffset, setSelectedOffset] = useState(1)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringMonths, setRecurringMonths] = useState('3')
  const [saving, setSaving] = useState(false)

  const futureMonths = Array.from({ length: 12 }, (_, i) => {
    const offset = i + 1
    const cycle = getCycle(user?.cycle_start ?? 1, offset)
    return { offset, label: cycle.monthYear, cycleStartISO: cycle.startISO }
  })

  useEffect(() => {
    if (!visible) return
    if (entry) {
      setType(entry.type)
      setDescription(entry.description)
      setAmountCents(Math.round(Number(entry.amount) * 100).toString())
      const found = futureMonths.find(m => m.cycleStartISO === entry.cycle_start_date)
      setSelectedOffset(found ? found.offset : 1)
      setIsRecurring(entry.is_recurring)
      setRecurringMonths('3')
    } else {
      setType(initialType)
      setDescription('')
      setAmountCents('0')
      setSelectedOffset(1)
      setIsRecurring(false)
      setRecurringMonths('3')
    }
  }, [visible])

  const handleSave = async () => {
    if (!user) return
    if (!description.trim()) { Alert.alert('Erro', 'Informe uma descrição.'); return }
    if (centsToFloat(amountCents) <= 0) { Alert.alert('Erro', 'Informe um valor maior que zero.'); return }

    setSaving(true)
    try {
      if (entry) {
        const cycle = getCycle(user.cycle_start ?? 1, selectedOffset)
        await supabase.from('projection_entries').update({
          type,
          description: description.trim(),
          amount: centsToFloat(amountCents),
          entry_date: cycle.startISO,
          cycle_start_date: cycle.startISO,
          is_recurring: isRecurring,
        }).eq('id', entry.id)
      } else {
        const months = isRecurring ? Math.max(1, parseInt(recurringMonths) || 1) : 1
        const rows = Array.from({ length: months }, (_, i) => {
          const cycle = getCycle(user.cycle_start ?? 1, selectedOffset + i)
          return {
            user_id: user.id,
            type,
            description: description.trim(),
            amount: centsToFloat(amountCents),
            entry_date: cycle.startISO,
            cycle_start_date: cycle.startISO,
            is_recurring: isRecurring,
          }
        })
        await supabase.from('projection_entries').insert(rows)
      }
      onSuccess()
      onClose()
    } catch (e) {
      Alert.alert('Erro', String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject as any} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{entry ? 'Editar lançamento' : 'Novo lançamento futuro'}</Text>

          {/* Type toggle */}
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'income' && { backgroundColor: Colors.success, borderColor: Colors.success }]}
              onPress={() => setType('income')}
            >
              <Text style={[styles.typeBtnText, type === 'income' && { color: '#fff' }]}>💰 Receita</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'expense' && { backgroundColor: Colors.danger, borderColor: Colors.danger }]}
              onPress={() => setType('expense')}
            >
              <Text style={[styles.typeBtnText, type === 'expense' && { color: '#fff' }]}>📋 Despesa</Text>
            </TouchableOpacity>
          </View>

          {/* Description */}
          <Text style={styles.label}>Descrição</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Ex: Bônus de julho, IPVA..."
            placeholderTextColor={Colors.textMuted}
          />

          {/* Amount */}
          <Text style={styles.label}>Valor</Text>
          <TextInput
            style={styles.input}
            value={formatCents(amountCents)}
            onChangeText={t => setAmountCents(digitsOnly(t) || '0')}
            keyboardType="numeric"
            placeholderTextColor={Colors.textMuted}
          />

          {/* Month selector */}
          <Text style={styles.label}>Mês</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
              {futureMonths.map(m => (
                <TouchableOpacity
                  key={m.offset}
                  style={[styles.monthChip, selectedOffset === m.offset && styles.monthChipActive]}
                  onPress={() => setSelectedOffset(m.offset)}
                >
                  <Text style={[styles.monthChipText, selectedOffset === m.offset && styles.monthChipTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Recurring toggle */}
          <View style={styles.recurringRow}>
            <Text style={styles.label}>Recorrente?</Text>
            <TouchableOpacity
              style={[styles.toggle, isRecurring && styles.toggleOn]}
              onPress={() => setIsRecurring(!isRecurring)}
            >
              <Text style={[styles.toggleText, isRecurring && { color: '#fff' }]}>
                {isRecurring ? 'Sim' : 'Não'}
              </Text>
            </TouchableOpacity>
          </View>

          {isRecurring && (
            <View style={styles.recurringDetail}>
              <Text style={styles.label}>Por quantos meses?</Text>
              <TextInput
                style={[styles.input, { width: 80 }]}
                value={recurringMonths}
                onChangeText={t => setRecurringMonths(t.replace(/\D/g, ''))}
                keyboardType="numeric"
                maxLength={2}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar lançamento'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textDark, marginBottom: 20 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textDark, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 16,
    color: Colors.textDark, marginBottom: 16, backgroundColor: Colors.background,
  },
  monthChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  monthChipActive: { borderColor: Colors.primary, backgroundColor: Colors.lightBlue },
  monthChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  monthChipTextActive: { color: Colors.primary },
  recurringRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  toggle: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  toggleOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  recurringDetail: { marginBottom: 8 },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
