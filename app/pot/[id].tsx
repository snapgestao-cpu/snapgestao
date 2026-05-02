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
import { getPotAtMonth } from '../../lib/pot-history'
import { brl } from '../../lib/finance'
import { Pot, Transaction } from '../../types'
import TransactionGroup from '../../components/TransactionGroup'
import { groupTransactionsByMerchantAndDate, groupByDate, formatDateHeader } from '../../lib/group-transactions'
import { SearchBar } from '../../components/SearchBar'
import NewScheduledModal from '../../components/NewScheduledModal'
import ScheduledItem from '../../components/ScheduledItem'
import { getScheduledForMonth, confirmScheduled, cancelScheduledMonth } from '../../lib/scheduled-transactions'

type TxWithPot = Transaction & { potName?: string; potColor?: string }

export default function PotDetailScreen() {
  const { id, cycleOffset: offsetParam } = useLocalSearchParams<{ id: string; cycleOffset: string }>()
  const { user } = useAuthStore()

  const cycleOffset = parseInt(offsetParam || '0', 10)
  const cycle = getCycle(user?.cycle_start ?? 1, cycleOffset)
  const defaultDate = cycleOffset === 0
    ? new Date().toISOString().split('T')[0]
    : cycle.startISO

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
  const [searchQuery, setSearchQuery] = useState('')
  const [scheduledItems, setScheduledItems] = useState<any[]>([])
  const [showScheduledModal, setShowScheduledModal] = useState(false)

  const loadData = useCallback(async () => {
    if (!user || !id) return
    try {
      const c = getCycle(user.cycle_start ?? 1, cycleOffset)

      const [potRes, historyData, sourcesRes, txNonCreditRes, txCreditRes, creditExpRes, otherExpRes] = await Promise.all([
        supabase.from('pots').select('*').eq('id', id).single(),
        getPotAtMonth(id, user.cycle_start ?? 1, cycleOffset),
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

      const base = potRes.data as Pot | null
      const p = base && historyData
        ? { ...base, name: historyData.name, limit_amount: historyData.limit_amount }
        : base
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

  async function loadScheduled() {
    if (!user || !id) return
    const items = await getScheduledForMonth(
      user.id, user.cycle_start ?? 1, cycleOffset, id
    )
    setScheduledItems(items)
  }

  useEffect(() => { setLoading(true); loadData() }, [loadData])
  useEffect(() => { loadScheduled() }, [user?.id, id, cycleOffset])

  const onRefresh = () => { setRefreshing(true); loadData() }

  const handleDelete = () => {
    if (!pot || !user) return
    const alertMsg = cycleOffset > 0
      ? `Excluir "${pot.name}" vai remover este pote a partir de ${cycle.label}.\n\nO mês atual e os anteriores não serão afetados.`
      : `Excluir "${pot.name}" vai remover este pote do mês atual e dos seguintes.\n\nOs lançamentos de meses anteriores serão preservados.`

    Alert.alert('Excluir pote', alertMsg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('transactions').delete()
              .eq('pot_id', pot.id).eq('type', 'expense')
              .gte('date', cycle.startISO)
            const { error } = await supabase.from('pots')
              .update({ deleted_at: cycle.start.toISOString() })
              .eq('id', pot.id).eq('user_id', user.id)
            if (error) throw error
            router.back()
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir o pote.')
          }
        },
      },
    ])
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
    { icon: '📋', label: 'Agendar', onPress: () => setShowScheduledModal(true) },
    { icon: '✏️', label: 'Editar', onPress: () => setShowEdit(true) },
    { icon: '🗑️', label: 'Excluir', onPress: handleDelete },
  ]

  const q = searchQuery.trim().toLowerCase()
  const filteredTransactions = q
    ? transactions.filter(t =>
        (t.description ?? '').toLowerCase().includes(q) ||
        (t.merchant ?? '').toLowerCase().includes(q)
      )
    : transactions
  const merchantGroups = groupTransactionsByMerchantAndDate(filteredTransactions)
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
            {cycleOffset !== 0 && (
              <Text style={[styles.cycleBadge, cycleOffset > 0 && { color: '#4F46E5' }]}>
                {cycleOffset > 0 ? '🔮' : '📅'} {cycle.label}
              </Text>
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

        {/* Banner: lançamentos a confirmar */}
        {scheduledItems.length > 0 && (
          <View style={styles.pendingBanner}>
            <Text style={{ fontSize: 20 }}>📋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingBannerTitle}>
                {scheduledItems.length}{' '}
                {scheduledItems.length === 1
                  ? 'lançamento aguardando confirmação'
                  : 'lançamentos aguardando confirmação'}
              </Text>
              <Text style={styles.pendingBannerSub}>
                Confirme ou exclua os lançamentos abaixo
              </Text>
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          {ACTION_BTNS.map(btn => (
            <TouchableOpacity key={btn.label} style={styles.actionBtn} onPress={btn.onPress} activeOpacity={0.7}>
              <Text style={styles.actionBtnIcon}>{btn.icon}</Text>
              <Text style={styles.actionBtnLabel}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Lançamentos a confirmar */}
        {scheduledItems.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionTitle, { color: '#92400E' }]}>
              📋 A Confirmar
            </Text>
            {scheduledItems.map(item => (
              <ScheduledItem
                key={item.id}
                item={item}
                onConfirm={() => {
                  const s = item.scheduled_transactions
                  const amountFmt = Number(s?.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  Alert.alert(
                    '✅ Confirmar lançamento',
                    `Confirmar "${s?.description}" de ${amountFmt}?`,
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Confirmar',
                        onPress: async () => {
                          try {
                            await confirmScheduled(
                              item.id, s.id, user!.id, s.pot_id,
                              {
                                description: s.description,
                                amount: s.amount,
                                payment_method: s.payment_method,
                                merchant: s.merchant,
                                date: new Date().toISOString().split('T')[0],
                              }
                            )
                            await Promise.all([loadScheduled(), loadData()])
                            setToast({ message: 'Lançamento confirmado!', color: Colors.success })
                          } catch {
                            Alert.alert('Erro', 'Não foi possível confirmar.')
                          }
                        },
                      },
                    ]
                  )
                }}
                onCancel={() => {
                  Alert.alert(
                    '🗑️ Excluir este mês',
                    'Excluir apenas este mês? Os outros meses não serão afetados.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Excluir',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await cancelScheduledMonth(item.id)
                            await loadScheduled()
                          } catch {
                            Alert.alert('Erro', 'Não foi possível excluir.')
                          }
                        },
                      },
                    ]
                  )
                }}
              />
            ))}
          </View>
        )}

        {/* Transactions */}
        <Text style={styles.sectionTitle}>Lançamentos — {cycle.monthYear}</Text>
        <SearchBar value={searchQuery} onChangeText={setSearchQuery} />

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
                      const hasParcelas = txs.some(t => t.payment_method === 'credit' && (t.installment_total ?? 0) > 1)
                      const aviso = hasParcelas
                        ? '\n\n⚠️ Atenção: este grupo contém parcelas de cartão. Apenas estas parcelas serão excluídas — as demais parcelas de outros meses permanecem.'
                        : ''
                      Alert.alert(
                        'Excluir lançamentos',
                        `Deseja excluir todos os ${txs.length} lançamentos de "${txs[0].merchant}"?\n\nTotal: ${brl(txs.reduce((s, t) => s + Number(t.amount), 0))}${aviso}`,
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
        initialDate={defaultDate}
      />
      <NewIncomeModal
        visible={showIncome}
        onClose={() => setShowIncome(false)}
        onSuccess={() => handleSuccess('Receita registrada!')}
        initialDate={defaultDate}
      />
      <NewPotModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        onSuccess={handleSuccess}
        editPot={pot}
        totalIncome={totalIncome}
        cycleOffset={cycleOffset}
      />
      <EditTransactionModal
        visible={!!editingTx}
        transaction={editingTx}
        pots={[pot]}
        onClose={() => setEditingTx(null)}
        onSuccess={msg => { setEditingTx(null); handleSuccess(msg) }}
      />
      {toast && <Toast message={toast.message} color={toast.color} onHide={() => setToast(null)} />}
      <NewScheduledModal
        visible={showScheduledModal}
        potId={pot.id}
        potName={pot.name}
        cycleStart={user?.cycle_start ?? 1}
        cycleOffset={cycleOffset}
        onClose={() => setShowScheduledModal(false)}
        onSuccess={() => {
          setShowScheduledModal(false)
          loadScheduled()
          setToast({ message: 'Lançamento agendado!', color: Colors.primary })
        }}
      />
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
  pendingBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  pendingBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  pendingBannerSub: { fontSize: 11, color: '#B45309', marginTop: 2 },
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
