import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { JarPot } from '../../components/JarPot'
import { NewExpenseModal } from '../../components/NewExpenseModal'
import { NewIncomeModal } from '../../components/NewIncomeModal'
import { NewPotModal } from '../../components/NewPotModal'
import { EditTransactionModal } from '../../components/EditTransactionModal'
import { Toast } from '../../components/Toast'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { getCycle } from '../../lib/cycle'
import { getPotIcon } from '../../lib/potIcons'
import { brl } from '../../lib/finance'
import { Pot, Transaction } from '../../types'
import { formatDateShort } from '../../lib/cycle'

type TxWithPot = Transaction & { potName?: string; potColor?: string }

export default function PotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuthStore()

  const [pot, setPot] = useState<Pot | null>(null)
  const [spent, setSpent] = useState(0)
  const [transactions, setTransactions] = useState<TxWithPot[]>([])
  const [totalIncome, setTotalIncome] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [showExpense, setShowExpense] = useState(false)
  const [showIncome, setShowIncome] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)

  const loadData = useCallback(async () => {
    if (!user || !id) return
    try {
      const cycle = getCycle(user.cycle_start ?? 1, 0)

      const [potRes, sourcesRes, txRes] = await Promise.all([
        supabase.from('pots').select('*').eq('id', id).single(),
        supabase.from('income_sources').select('amount').eq('user_id', user.id),
        supabase.from('transactions').select('*')
          .eq('pot_id', id)
          .gte('date', cycle.startISO).lte('date', cycle.endISO)
          .order('date', { ascending: false }),
      ])

      const p = potRes.data as Pot | null
      setPot(p)

      const income = ((sourcesRes.data ?? []) as any[])
        .reduce((s, r) => s + Number(r.amount), 0)
      setTotalIncome(income)

      const txs = (txRes.data ?? []) as Transaction[]
      const spentTotal = txs
        .filter(t => t.type === 'expense' || t.type === 'goal_deposit')
        .reduce((s, t) => s + Number(t.amount), 0)
      setSpent(spentTotal)

      setTransactions(txs.map(tx => ({
        ...tx,
        potName: p?.name,
        potColor: p?.color,
      })))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, id])

  useEffect(() => { setLoading(true); loadData() }, [loadData])

  const onRefresh = () => { setRefreshing(true); loadData() }

  const handleDelete = () => {
    if (!pot || !user) return
    const cycle = getCycle(user.cycle_start ?? 1, 0)
    const startStr = cycle.startISO
    const endStr = cycle.endISO
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    Alert.alert(
      'Excluir pote',
      `Excluir "${pot.name}" vai apagar os gastos vinculados apenas no ciclo atual (${fmt(cycle.start)} a ${fmt(cycle.end)}). Outros meses não serão afetados. Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            await supabase.from('transactions').delete()
              .eq('pot_id', pot.id).eq('type', 'expense')
              .gte('date', startStr).lte('date', endStr)
            await supabase.from('pots').update({ deleted_at: new Date().toISOString() }).eq('id', pot.id)
            router.back()
          },
        },
      ]
    )
  }

  const handleSuccess = (msg: string) => {
    loadData()
    setToast({ message: msg, color: Colors.primary })
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  if (!pot) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.errorText}>Pote não encontrado.</Text>
      </SafeAreaView>
    )
  }

  const limit = pot.limit_amount ?? 0
  const percent = limit > 0 ? (spent / limit) * 100 : 0

  const ACTION_BTNS = [
    { icon: '💸', label: 'Gasto', onPress: () => setShowExpense(true) },
    { icon: '💰', label: 'Receita', onPress: () => setShowIncome(true) },
    {
      icon: '📷', label: 'Cupom', onPress: () => router.push({
        pathname: '/ocr',
        params: {
          defaultPotId: pot.id,
          defaultPotName: pot.name,
          cycleDate: cycle.start.toISOString().split('T')[0],
        },
      }),
    },
    { icon: '✏️', label: 'Editar', onPress: () => setShowEdit(true) },
    { icon: '🗑️', label: 'Excluir', onPress: handleDelete },
  ]

  // Group txs by date
  const groups: { date: string; label: string; items: TxWithPot[] }[] = []
  const seen: Record<string, number> = {}
  for (const tx of transactions) {
    if (seen[tx.date] === undefined) {
      seen[tx.date] = groups.length
      groups.push({ date: tx.date, label: formatDateShort(tx.date), items: [] })
    }
    groups[seen[tx.date]].items.push(tx)
  }

  const cycle = getCycle(user!.cycle_start ?? 1, 0)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>{pot.name}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Jar */}
        <View style={styles.jarWrapper}>
          <JarPot
            name={pot.name}
            color={pot.color}
            percent={percent}
            spent={spent}
            limit={pot.limit_amount}
            size={150}
          />
          <Text style={styles.spentLabel}>
            {brl(spent)} gastos{limit > 0 ? ` de ${brl(limit)}` : ''}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          {ACTION_BTNS.map(btn => (
            <TouchableOpacity key={btn.label} style={styles.actionBtn} onPress={btn.onPress} activeOpacity={0.7}>
              <Text style={styles.actionBtnIcon}>{btn.icon}</Text>
              <Text style={styles.actionBtnLabel}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Transactions */}
        <Text style={styles.sectionTitle}>Lançamentos — {cycle.monthYear}</Text>

        {groups.length === 0 ? (
          <View style={styles.emptyWrapper}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>Nenhum lançamento neste pote ainda.</Text>
            <Text style={styles.emptyHint}>Toque em Gasto ou Receita para registrar.</Text>
          </View>
        ) : (
          groups.map(group => (
            <View key={group.date}>
              <Text style={styles.dateHeader}>{group.label}</Text>
              <View style={styles.txCard}>
                {group.items.map(tx => (
                  <View key={tx.id} style={styles.txRow}>
                    <View style={styles.txLeft}>
                      <View style={[styles.txDot, { backgroundColor: pot.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txDesc} numberOfLines={1}>
                          {tx.description ?? tx.merchant ?? 'Sem descrição'}
                        </Text>
                        <Text style={styles.txMeta}>{tx.payment_method?.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={[styles.txAmount, { color: tx.type === 'income' ? Colors.success : Colors.danger }]}>
                      {tx.type === 'income' ? '+' : '-'}{brl(tx.amount)}
                    </Text>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => setEditingTx(tx)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                    >
                      <Text style={styles.editIcon}>✏️</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <NewExpenseModal
        visible={showExpense}
        onClose={() => setShowExpense(false)}
        onSuccess={() => handleSuccess('Gasto registrado!')}
        pots={[pot]}
        initialDate={cycle.startISO}
      />
      <NewIncomeModal
        visible={showIncome}
        onClose={() => setShowIncome(false)}
        onSuccess={() => handleSuccess('Receita registrada!')}
        initialDate={cycle.startISO}
      />
      <NewPotModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        onSuccess={handleSuccess}
        editPot={pot}
        totalIncome={totalIncome}
      />
      <EditTransactionModal
        visible={!!editingTx}
        transaction={editingTx}
        pots={[pot]}
        onClose={() => setEditingTx(null)}
        onSuccess={msg => { setEditingTx(null); handleSuccess(msg) }}
      />
      {toast && <Toast message={toast.message} color={toast.color} onHide={() => setToast(null)} />}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 24,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backArrow: { fontSize: 32, color: Colors.primary, fontWeight: '300', lineHeight: 36 },
  topTitle: { fontSize: 18, fontWeight: '800', color: Colors.textDark, flex: 1, textAlign: 'center' },
  errorText: { textAlign: 'center', color: Colors.danger, marginTop: 40, fontSize: 16 },
  jarWrapper: { alignItems: 'center', marginBottom: 24 },
  spentLabel: { fontSize: 14, color: Colors.textMuted, marginTop: 10 },
  actionsRow: {
    flexDirection: 'row', gap: 10, marginBottom: 28,
    justifyContent: 'center',
  },
  actionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 0.5, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  actionBtnIcon: { fontSize: 20, marginBottom: 4 },
  actionBtnLabel: { fontSize: 11, fontWeight: '600', color: Colors.textDark },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textDark, marginBottom: 12 },
  emptyWrapper: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.textDark, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 6 },
  dateHeader: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 6, marginTop: 4 },
  txCard: {
    backgroundColor: Colors.white, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, marginBottom: 8,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  txLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 },
  txDot: { width: 10, height: 10, borderRadius: 5 },
  txDesc: { fontSize: 14, fontWeight: '500', color: Colors.textDark },
  txMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700', marginRight: 8 },
  editBtn: { padding: 4 },
  editIcon: { fontSize: 14 },
})
