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
import { brl } from '../../lib/finance'
import { Pot, Transaction } from '../../types'
import TransactionGroup from '../../components/TransactionGroup'
import { groupTransactionsByMerchantAndDate, groupByDate, formatDateHeader } from '../../lib/group-transactions'

type TxWithPot = Transaction & { potName?: string; potColor?: string }

export default function PotDetailScreen() {
  const { id, cycleOffset: offsetParam } = useLocalSearchParams<{ id: string; cycleOffset: string }>()
  const { user } = useAuthStore()

  const cycleOffset = parseInt(offsetParam || '0', 10)
  const cycle = getCycle(user?.cycle_start ?? 1, cycleOffset)

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
      const c = getCycle(user.cycle_start ?? 1, cycleOffset)

      const [potRes, sourcesRes, txNonCreditRes, txCreditRes, creditExpRes, otherExpRes] = await Promise.all([
        supabase.from('pots').select('*').eq('id', id).single(),
        supabase.from('income_sources').select('amount').eq('user_id', user.id),
        supabase.from('transactions').select('*')
          .eq('pot_id', id).neq('payment_method', 'credit')
          .gte('date', c.startISO).lte('date', c.endISO)
          .order('date', { ascending: false }),
        supabase.from('transactions').select('*')
          .eq('pot_id', id).eq('payment_method', 'credit')
          .not('billing_date', 'is', null)
          .gte('billing_date', c.startISO).lte('billing_date', c.endISO)
          .order('billing_date', { ascending: false }),
        supabase.from('transactions').select('amount')
          .eq('pot_id', id).eq('type', 'expense').eq('payment_method', 'credit')
          .gte('billing_date', c.startISO).lte('billing_date', c.endISO),
        supabase.from('transactions').select('amount')
          .eq('pot_id', id).in('type', ['expense', 'goal_deposit']).neq('payment_method', 'credit')
          .gte('date', c.startISO).lte('date', c.endISO),
      ])

      const p = potRes.data as Pot | null
      setPot(p)

      const income = ((sourcesRes.data ?? []) as any[])
        .reduce((s, r) => s + Number(r.amount), 0)
      setTotalIncome(income)

      const spentTotal = [
        ...((creditExpRes.data ?? []) as any[]),
        ...((otherExpRes.data ?? []) as any[]),
      ].reduce((s, t) => s + Number(t.amount), 0)
      setSpent(spentTotal)

      const txsNonCredit = (txNonCreditRes.data ?? []) as Transaction[]
      const txsCredit = (txCreditRes.data ?? []) as Transaction[]
      const allTxs = [...txsNonCredit, ...txsCredit].sort((a, b) => {
        const dateA = a.payment_method === 'credit' ? (a.billing_date ?? a.date) : a.date
        const dateB = b.payment_method === 'credit' ? (b.billing_date ?? b.date) : b.date
        return dateB.localeCompare(dateA)
      })
      setTransactions(allTxs.map(tx => ({
        ...tx,
        potName: p?.name,
        potColor: p?.color,
      })))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, id, cycleOffset])

  useEffect(() => { setLoading(true); loadData() }, [loadData])

  const onRefresh = () => { setRefreshing(true); loadData() }

  const handleDelete = () => {
    if (!pot || !user) return
    const currentCycle = getCycle(user.cycle_start ?? 1, 0)
    Alert.alert(
      'Excluir pote',
      `Excluir "${pot.name}" vai remover este pote do mês atual e dos seguintes.\n\nOs lançamentos de meses anteriores serão preservados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('transactions').delete()
                .eq('pot_id', pot.id).eq('type', 'expense')
                .gte('date', currentCycle.startISO)
              const { error } = await supabase.from('pots')
                .update({ deleted_at: currentCycle.start.toISOString() })
                .eq('id', pot.id).eq('user_id', user.id)
              if (error) throw error
              router.back()
            } catch {
              Alert.alert('Erro', 'Não foi possível excluir o pote.')
            }
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

  const merchantGroups = groupTransactionsByMerchantAndDate(transactions)
  const txByDate = groupByDate(merchantGroups)
  const txDates = Object.keys(txByDate).sort((a, b) => b.localeCompare(a))

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
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.topTitle} numberOfLines={1}>{pot.name}</Text>
            {cycleOffset < 0 && (
              <Text style={styles.cycleBadge}>📅 {cycle.label}</Text>
            )}
          </View>
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

        {txDates.length === 0 ? (
          <View style={styles.emptyWrapper}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>Nenhum lançamento neste pote ainda.</Text>
            <Text style={styles.emptyHint}>Toque em Gasto ou Receita para registrar.</Text>
          </View>
        ) : (
          txDates.map(date => (
            <View key={date}>
              <Text style={styles.dateHeader}>{formatDateHeader(date)}</Text>
              <View style={styles.txCard}>
                {txByDate[date].map(group => (
                  <TransactionGroup
                    key={group.key}
                    transactions={group.transactions}
                    onEdit={t => setEditingTx(t as any)}
                    onDeleteGroup={txs => {
                      Alert.alert(
                        'Excluir lançamentos',
                        `Deseja excluir todos os ${txs.length} lançamentos de "${txs[0].merchant}"?\n\nTotal: ${brl(txs.reduce((s, t) => s + Number(t.amount), 0))}`,
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Excluir todos', style: 'destructive',
                            onPress: async () => {
                              const ids = txs.map(t => t.id)
                              const { error } = await supabase.from('transactions').delete().in('id', ids)
                              if (error) { Alert.alert('Erro', 'Não foi possível excluir.'); return }
                              handleSuccess(`${ids.length} lançamento${ids.length !== 1 ? 's' : ''} excluído${ids.length !== 1 ? 's' : ''}`)
                            },
                          },
                        ]
                      )
                    }}
                  />
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
      />
      <NewIncomeModal
        visible={showIncome}
        onClose={() => setShowIncome(false)}
        onSuccess={() => handleSuccess('Receita registrada!')}
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
  topTitle: { fontSize: 18, fontWeight: '800', color: Colors.textDark },
  cycleBadge: { fontSize: 12, color: Colors.warning, marginTop: 2 },
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
  prevInstallBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3,
    backgroundColor: '#FFF3E0', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start',
  },
  prevInstallText: { fontSize: 10, color: '#BA7517', fontWeight: '600' },
})
