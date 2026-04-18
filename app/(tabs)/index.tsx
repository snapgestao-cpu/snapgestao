import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, TouchableOpacity, Animated, Modal, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { PotCard } from '../../components/PotCard'
import { TransactionItem } from '../../components/TransactionItem'
import { NewExpenseModal } from '../../components/NewExpenseModal'
import { NewIncomeModal } from '../../components/NewIncomeModal'
import { NewPotModal } from '../../components/NewPotModal'
import { Toast } from '../../components/Toast'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { Pot, Transaction } from '../../types'

type PotRow = {
  pot: Pot
  spent: number
  remaining: number
}

type TxWithPot = Transaction & { potName?: string; potColor?: string }

function getCycleDates(cycleDay: number): { start: string; end: string } {
  const now = new Date()
  const d = now.getDate()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = d >= cycleDay ? new Date(y, m, cycleDay) : new Date(y, m - 1, cycleDay)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, cycleDay - 1)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const FAB_SIZE = 56
const MENU_ITEMS = [
  { key: 'expense', label: 'Registrar gasto', color: Colors.danger, icon: '−' },
  { key: 'income', label: 'Registrar receita', color: Colors.success, icon: '+' },
]

export default function DashboardScreen() {
  const { user } = useAuthStore()

  const [totalIncome, setTotalIncome] = useState(0)
  const [potsData, setPotsData] = useState<PotRow[]>([])
  const [recentTxs, setRecentTxs] = useState<TxWithPot[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // FAB
  const [fabOpen, setFabOpen] = useState(false)
  const fabAnim = useRef(new Animated.Value(0)).current

  // Transaction modals
  const [showExpense, setShowExpense] = useState(false)
  const [showIncome, setShowIncome] = useState(false)

  // Pot modals
  const [showNewPot, setShowNewPot] = useState(false)
  const [editingPot, setEditingPot] = useState<Pot | null>(null)
  const [potAction, setPotAction] = useState<Pot | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)

  // Transaction filter by pot
  const [filterPotId, setFilterPotId] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    if (!user) return
    try {
      const { data: incomeSources } = await supabase
        .from('income_sources')
        .select('amount')
        .eq('user_id', user.id)
      setTotalIncome((incomeSources ?? []).reduce((sum, s) => sum + Number(s.amount), 0))

      const { data: pots } = await supabase
        .from('pots')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (!pots || pots.length === 0) {
        setPotsData([])
        setRecentTxs([])
        return
      }

      const { start: cycleStart, end: cycleEnd } = getCycleDates(user.cycle_start ?? 1)

      const rows: PotRow[] = await Promise.all(
        pots.map(async (pot) => {
          const { data: txs } = await supabase
            .from('transactions')
            .select('amount')
            .eq('pot_id', pot.id)
            .eq('type', 'expense')
            .gte('date', cycleStart)
            .lte('date', cycleEnd)
          const spent = (txs ?? []).reduce((sum, t) => sum + Number(t.amount), 0)
          const remaining = (pot.limit_amount ?? 0) - spent
          return { pot: pot as Pot, spent, remaining }
        })
      )
      setPotsData(rows)

      const potMap = Object.fromEntries(pots.map(p => [p.id, p]))

      const { data: txsRaw } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', cycleStart)
        .lte('date', cycleEnd)
        .order('date', { ascending: false })
        .limit(10)

      const txs: TxWithPot[] = (txsRaw ?? []).map((tx: any) => ({
        ...tx,
        potName: tx.pot_id ? potMap[tx.pot_id]?.name : undefined,
        potColor: tx.pot_id ? potMap[tx.pot_id]?.color : undefined,
      }))
      setRecentTxs(txs)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    setLoading(true)
    loadDashboard()
  }, [loadDashboard])

  const onRefresh = () => {
    setRefreshing(true)
    loadDashboard()
  }

  const toggleFab = () => {
    const toValue = fabOpen ? 0 : 1
    Animated.spring(fabAnim, { toValue, useNativeDriver: true, bounciness: 6 }).start()
    setFabOpen(!fabOpen)
  }

  const closeFab = () => {
    if (!fabOpen) return
    Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true }).start()
    setFabOpen(false)
  }

  const handleFabItem = (key: string) => {
    closeFab()
    if (key === 'expense') setShowExpense(true)
    else if (key === 'income') setShowIncome(true)
  }

  const handleSuccess = (msg: string, color: string) => {
    loadDashboard()
    setToast({ message: msg, color })
  }

  const handleDeletePot = () => {
    if (!potAction) return
    const pot = potAction
    Alert.alert(
      'Excluir pote',
      `Deseja excluir o pote "${pot.name}"? Os lançamentos vinculados serão mantidos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setPotAction(null)
            const { error } = await supabase.from('pots').delete().eq('id', pot.id)
            if (error) {
              setToast({ message: 'Erro ao excluir pote.', color: Colors.danger })
            } else {
              loadDashboard()
              setToast({ message: `Pote "${pot.name}" excluído.`, color: Colors.textMuted })
            }
          },
        },
      ]
    )
  }

  const totalExpense = potsData.reduce((sum, r) => sum + r.spent, 0)
  const fabRotate = fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })

  const filteredPot = filterPotId ? potsData.find(r => r.pot.id === filterPotId)?.pot : null
  const displayedTxs = filterPotId
    ? recentTxs.filter(tx => tx.pot_id === filterPotId)
    : recentTxs

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        onScrollBeginDrag={closeFab}
      >
        <Text style={styles.greeting}>Olá, {user?.name ?? 'usuário'} 👋</Text>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: Colors.lightGreen }]}>
            <Text style={styles.summaryLabel}>Receitas</Text>
            <Text style={[styles.summaryValue, { color: Colors.success }]}>{brl(totalIncome)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: Colors.lightRed }]}>
            <Text style={styles.summaryLabel}>Despesas</Text>
            <Text style={[styles.summaryValue, { color: Colors.danger }]}>{brl(totalExpense)}</Text>
          </View>
        </View>

        {/* Meus potes header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Meus potes</Text>
          <TouchableOpacity
            onPress={() => setShowNewPot(true)}
            style={styles.newPotBtn}
          >
            <Text style={styles.newPotBtnText}>+ Novo pote</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        ) : potsData.length === 0 ? (
          <Text style={styles.empty}>Nenhum pote criado ainda.</Text>
        ) : (
          potsData.map(({ pot, spent, remaining }) => (
            <PotCard
              key={pot.id}
              name={pot.name}
              color={pot.color}
              limit_amount={pot.limit_amount}
              spent={spent}
              remaining={remaining}
              onLongPress={() => setPotAction(pot)}
            />
          ))
        )}

        {!loading && (
          <>
            {/* Lançamentos recentes header */}
            <View style={[styles.sectionHeader, { marginTop: 8 }]}>
              <Text style={styles.sectionTitle}>
                {filteredPot ? `Lançamentos — ${filteredPot.name}` : 'Lançamentos recentes'}
              </Text>
              {filteredPot && (
                <TouchableOpacity onPress={() => setFilterPotId(null)} style={styles.clearFilterBtn}>
                  <Text style={styles.clearFilterText}>Ver todos</Text>
                </TouchableOpacity>
              )}
            </View>
            {displayedTxs.length === 0 ? (
              <Text style={styles.empty}>Nenhum lançamento neste ciclo.</Text>
            ) : (
              <View style={styles.txCard}>
                {displayedTxs.map(tx => (
                  <TransactionItem
                    key={tx.id}
                    transaction={tx}
                    potName={tx.potName}
                    potColor={tx.potColor}
                  />
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 96 }} />
      </ScrollView>

      {/* FAB menu items */}
      {MENU_ITEMS.map((item, i) => {
        const translateY = fabAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -(FAB_SIZE + 12) * (i + 1)],
        })
        const opacity = fabAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] })
        return (
          <Animated.View
            key={item.key}
            style={[styles.fabMenuItem, { transform: [{ translateY }], opacity }]}
            pointerEvents={fabOpen ? 'auto' : 'none'}
          >
            <Text style={styles.fabMenuLabel}>{item.label}</Text>
            <TouchableOpacity
              style={[styles.fabMinor, { backgroundColor: item.color }]}
              onPress={() => handleFabItem(item.key)}
              activeOpacity={0.85}
            >
              <Text style={styles.fabIcon}>{item.icon}</Text>
            </TouchableOpacity>
          </Animated.View>
        )
      })}

      {/* Main FAB */}
      <TouchableOpacity style={styles.fab} onPress={toggleFab} activeOpacity={0.85}>
        <Animated.Text style={[styles.fabIcon, { transform: [{ rotate: fabRotate }] }]}>+</Animated.Text>
      </TouchableOpacity>

      {/* FAB backdrop */}
      {fabOpen && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject as any}
          activeOpacity={1}
          onPress={closeFab}
        />
      )}

      {/* Pot action sheet */}
      <Modal visible={!!potAction} transparent animationType="fade" onRequestClose={() => setPotAction(null)}>
        <TouchableOpacity
          style={styles.actionBackdrop}
          activeOpacity={1}
          onPress={() => setPotAction(null)}
        >
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>{potAction?.name}</Text>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => { setEditingPot(potAction); setPotAction(null) }}
            >
              <Text style={styles.actionBtnText}>✏️  Editar pote</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => { setFilterPotId(potAction?.id ?? null); setPotAction(null) }}
            >
              <Text style={styles.actionBtnText}>📋  Ver lançamentos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleDeletePot}>
              <Text style={[styles.actionBtnText, { color: Colors.danger }]}>🗑  Excluir pote</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnCancel} onPress={() => setPotAction(null)}>
              <Text style={styles.actionCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Transaction modals */}
      <NewExpenseModal
        visible={showExpense}
        onClose={() => setShowExpense(false)}
        onSuccess={() => handleSuccess('Gasto registrado!', Colors.danger)}
        pots={potsData.map(r => r.pot)}
      />

      <NewIncomeModal
        visible={showIncome}
        onClose={() => setShowIncome(false)}
        onSuccess={() => handleSuccess('Receita registrada!', Colors.success)}
      />

      {/* Pot creation modal */}
      <NewPotModal
        visible={showNewPot}
        onClose={() => setShowNewPot(false)}
        onSuccess={msg => handleSuccess(msg, Colors.primary)}
        totalIncome={totalIncome}
      />

      {/* Pot edit modal */}
      <NewPotModal
        visible={!!editingPot}
        onClose={() => setEditingPot(null)}
        onSuccess={msg => handleSuccess(msg, Colors.primary)}
        editPot={editingPot ?? undefined}
        totalIncome={totalIncome}
      />

      {toast && (
        <Toast
          message={toast.message}
          color={toast.color}
          onHide={() => setToast(null)}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20 },
  greeting: { fontSize: 22, fontWeight: '700', color: Colors.textDark, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 14 },
  summaryLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.textDark },
  newPotBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.lightBlue,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  newPotBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  clearFilterBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: Colors.lightBlue, borderRadius: 20,
  },
  clearFilterText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  loader: { marginTop: 32 },
  empty: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 12, marginBottom: 8 },
  txCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    zIndex: 10,
  },
  fabMinor: {
    width: FAB_SIZE - 8, height: FAB_SIZE - 8, borderRadius: (FAB_SIZE - 8) / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  fabMenuItem: {
    position: 'absolute', bottom: 28, right: 24,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    zIndex: 9,
  },
  fabMenuLabel: {
    backgroundColor: Colors.white, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    fontSize: 13, fontWeight: '600', color: Colors.textDark,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12, shadowRadius: 3, elevation: 3,
  },
  fabIcon: { fontSize: 28, color: '#fff', lineHeight: 32, fontWeight: '300' },
  actionBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
  },
  actionTitle: {
    fontSize: 15, fontWeight: '700', color: Colors.textDark,
    textAlign: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4,
  },
  actionBtn: {
    paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  actionBtnText: { fontSize: 16, fontWeight: '500', color: Colors.textDark },
  actionBtnCancel: {
    paddingVertical: 16, alignItems: 'center', marginTop: 4,
  },
  actionCancelText: { fontSize: 16, fontWeight: '600', color: Colors.textMuted },
})
