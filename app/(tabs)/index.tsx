import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  RefreshControl, TouchableOpacity, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { Colors } from '../../constants/colors'
import { JarPot } from '../../components/JarPot'
import { NewPotModal } from '../../components/NewPotModal'
import { BadgeToast } from '../../components/BadgeToast'
import { Badge } from '../../lib/badges'
import { Toast } from '../../components/Toast'
import { useAuthStore } from '../../stores/useAuthStore'
import { useCycleStore } from '../../stores/useCycleStore'
import { supabase } from '../../lib/supabase'
import { getCycle } from '../../lib/cycle'
import { fetchPotsForCycleWithHistory } from '../../lib/pot-history'
import { Pot } from '../../types'
import { brl } from '../../lib/finance'
import MonthPickerModal from '../../components/MonthPickerModal'

const CELL_WIDTH = (Dimensions.get('window').width - 32) / 2

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function formatMonthShort(date: Date): string {
  return MONTHS_SHORT[date.getMonth()] + '/' + String(date.getFullYear()).slice(2)
}

type PotRow = {
  pot: Pot
  spent: number
  remaining: number
  percent: number
}

export default function PotsScreen() {
  const { user } = useAuthStore()
  const { cycleOffset, setCycleOffset } = useCycleStore()

  const [potsData, setPotsData] = useState<PotRow[]>([])
  const [emergencyPot, setEmergencyPot] = useState<Pot | null>(null)
  const [emergencyBalance, setEmergencyBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [showNewPot, setShowNewPot] = useState(false)
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [editingPot, setEditingPot] = useState<Pot | null>(null)
  const [totalIncome, setTotalIncome] = useState(0)
  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])

  type CacheEntry = {
    offset: number; timestamp: number
    rows: PotRow[]; ep: Pot | null; epBalance: number; income: number
  }
  const cacheRef = useRef<CacheEntry | null>(null)

  const cycle = user ? getCycle(user.cycle_start ?? 1, cycleOffset) : null

  const loadPots = useCallback(async (forceRefresh = false) => {
    if (!user) return
    const cached = cacheRef.current
    if (!forceRefresh && cached && cached.offset === cycleOffset && Date.now() - cached.timestamp < 30000) {
      setPotsData(cached.rows)
      setEmergencyPot(cached.ep)
      setEmergencyBalance(cached.epBalance)
      setTotalIncome(cached.income)
      setLoading(false)
      setRefreshing(false)
      return
    }
    try {
      const c = getCycle(user.cycle_start ?? 1, cycleOffset)

      const [sourcesRes, pots, epRes] = await Promise.all([
        supabase.from('income_sources').select('amount').eq('user_id', user.id),
        // Potes ativos no ciclo: inclui potes deletados DEPOIS do fim do ciclo
        // (ex: pote deletado em mês futuro ainda aparece no mês atual)
        fetchPotsForCycleWithHistory(user.id, c.startISO, c.endISO),
        supabase.from('pots').select('*')
          .eq('user_id', user.id).eq('is_emergency', true).maybeSingle(),
      ])

      const income = ((sourcesRes.data ?? []) as any[])
        .reduce((s, r) => s + Number(r.amount), 0)
      setTotalIncome(income)

      const ep = epRes.data as Pot | null
      setEmergencyPot(ep)

      const [{ data: creditTxs }, { data: otherTxs }] = await Promise.all([
        supabase.from('transactions').select('amount, pot_id')
          .eq('user_id', user.id).eq('type', 'expense').eq('payment_method', 'credit')
          .gte('billing_date', c.startISO).lte('billing_date', c.endISO),
        supabase.from('transactions').select('amount, pot_id')
          .eq('user_id', user.id).in('type', ['expense', 'goal_deposit']).neq('payment_method', 'credit')
          .gte('date', c.startISO).lte('date', c.endISO),
      ])
      const allCycleTxs = [
        ...((creditTxs ?? []) as any[]),
        ...((otherTxs ?? []) as any[]),
      ]

      const rows: PotRow[] = pots.map(pot => {
        const spent = allCycleTxs
          .filter(t => t.pot_id === pot.id)
          .reduce((s, t) => s + Number(t.amount), 0)
        const limit = pot.limit_amount ?? 0
        const remaining = limit - spent
        const percent = limit > 0 ? (spent / limit) * 100 : 0
        return { pot, spent, remaining, percent }
      })
      setPotsData(rows)

      let epBalance = 0
      if (ep) {
        const { data: epTxs } = await supabase
          .from('transactions').select('amount,type').eq('pot_id', ep.id)
        epBalance = ((epTxs ?? []) as any[]).reduce((s: number, t: any) =>
          t.type === 'income' ? s + Number(t.amount) : s - Number(t.amount), 0)
        setEmergencyBalance(epBalance)
      }

      cacheRef.current = { offset: cycleOffset, timestamp: Date.now(), rows, ep, epBalance, income }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, cycleOffset])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      loadPots(true)
    }, [loadPots])
  )

  // Keep useEffect so cycleOffset changes reload while screen is already focused
  useEffect(() => {
    setLoading(true)
    loadPots(true)
  }, [cycleOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = () => { setRefreshing(true); loadPots(true) }

  const handleSuccess = (msg: string) => {
    cacheRef.current = null
    loadPots(true)
    setToast({ message: msg, color: Colors.primary })
  }

  const renderItem = ({ item }: { item: PotRow }) => (
    <TouchableOpacity
      style={{ width: CELL_WIDTH, alignItems: 'center', paddingBottom: 20, paddingHorizontal: 8 }}
      onPress={() => router.push({
        pathname: `/pot/${item.pot.id}`,
        params: { cycleOffset: String(cycleOffset) },
      })}
      activeOpacity={0.75}
    >
      <JarPot
        name={item.pot.name}
        color={item.pot.color}
        percent={item.percent}
        spent={item.spent}
        limit={item.pot.limit_amount}
        size={120}
      />
      <Text style={styles.potName}>{item.pot.name}</Text>
      <Text style={styles.potSpent}>{brl(item.spent)}</Text>
      <Text style={styles.potLimit}>de {brl(item.pot.limit_amount ?? 0)}</Text>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header: tudo em uma linha */}
      <View style={styles.header}>
        <Text style={styles.greeting} numberOfLines={1}>
          Olá, {user?.name?.split(' ')[0] ?? 'usuário'} 👋
        </Text>
        <View style={styles.monthNav}>
          <TouchableOpacity
            onPress={() => setCycleOffset(cycleOffset - 1)}
            style={styles.navArrowBtn}>
            <Text style={styles.navArrow}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowMonthPicker(true)}>
            <Text style={[styles.navLabel, { color: cycleOffset === 0 ? Colors.textDark : Colors.primary }]}>
              {cycle ? formatMonthShort(cycle.start) : ''} ▾
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { if (cycleOffset < 12) setCycleOffset(cycleOffset + 1) }}
            disabled={cycleOffset >= 12}
            style={[styles.navArrowBtn, { opacity: cycleOffset >= 12 ? 0.3 : 1 }]}
          >
            <Text style={styles.navArrow}>›</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setShowNewPot(true)} style={styles.newPotBtn}>
          <Text style={styles.newPotBtnPlus}>+</Text>
          <Text style={styles.newPotBtnText}>Pote</Text>
        </TouchableOpacity>
      </View>

      {cycleOffset < 0 && (
        <View style={styles.prevMonthBanner}>
          <Text style={{ fontSize: 12 }}>📅</Text>
          <Text style={styles.prevMonthText}>Mês anterior</Text>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.skeletonCard} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[1,2,3,4].map(i => <View key={i} style={styles.skeletonPot} />)}
          </View>
        </View>
      ) : (
        <FlatList
          data={potsData}
          keyExtractor={item => item.pot.id}
          numColumns={2}
          renderItem={renderItem}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrapper}>
              <Text style={styles.emptyText}>Nenhum pote criado ainda.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowNewPot(true)}>
                <Text style={styles.emptyBtnText}>Criar meu primeiro pote</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={
            emergencyPot ? (
              <TouchableOpacity
                style={styles.emergencyCard}
                onPress={() => router.push({
                  pathname: `/pot/${emergencyPot.id}`,
                  params: { cycleOffset: String(cycleOffset) },
                })}
                activeOpacity={0.8}
              >
                <Text style={styles.emergencyIcon}>🛡️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.emergencyTitle}>Emergência</Text>
                  <Text style={styles.emergencyBalance}>Saldo: {brl(emergencyBalance)}</Text>
                </View>
                <Text style={styles.emergencyArrow}>›</Text>
              </TouchableOpacity>
            ) : <View style={{ height: 96 }} />
          }
        />
      )}

      <MonthPickerModal
        visible={showMonthPicker}
        currentOffset={cycleOffset}
        cycleStart={user?.cycle_start ?? 1}
        onSelect={(o) => setCycleOffset(o)}
        onClose={() => setShowMonthPicker(false)}
      />
      <NewPotModal
        visible={showNewPot}
        onClose={() => setShowNewPot(false)}
        onSuccess={handleSuccess}
        onBadges={setPendingBadges}
        totalIncome={totalIncome}
        cycleStartDate={cycle?.start}
        isRetroactive={cycleOffset < 0}
        cycleOffset={cycleOffset}
      />
      <NewPotModal
        visible={!!editingPot}
        onClose={() => setEditingPot(null)}
        onSuccess={handleSuccess}
        editPot={editingPot ?? undefined}
        totalIncome={totalIncome}
        cycleOffset={cycleOffset}
      />
      {toast && <Toast message={toast.message} color={toast.color} onHide={() => setToast(null)} />}
      {pendingBadges.length > 0 && (
        <BadgeToast badges={pendingBadges} onDone={() => setPendingBadges([])} />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, gap: 8,
  },
  greeting: { fontSize: 20, fontWeight: '800', color: Colors.textDark, flex: 1 },
  monthNav: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 20,
    paddingHorizontal: 4, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  navArrowBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  navArrow: { fontSize: 20, color: Colors.primary, fontWeight: '600' },
  navLabel: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4 },
  prevMonthBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.lightAmber,
    paddingHorizontal: 16, paddingVertical: 5,
  },
  prevMonthText: { fontSize: 11, color: Colors.warning, fontWeight: '600' },
  newPotBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  newPotBtnPlus: { fontSize: 16, color: '#fff', fontWeight: '700' },
  newPotBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  grid: { paddingHorizontal: 8, paddingBottom: 16 },
  row: { justifyContent: 'space-around', paddingHorizontal: 8 },
  potName: {
    fontSize: 13, fontWeight: '700', color: Colors.textDark,
    textAlign: 'center', marginTop: 6,
    flexWrap: 'wrap',
  },
  potSpent: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
  potLimit: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 1 },
  emptyWrapper: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: 'center', marginBottom: 20 },
  emptyBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emergencyCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F0FF', borderRadius: 14,
    marginHorizontal: 16, marginBottom: 96, marginTop: 8,
    padding: 16, borderLeftWidth: 3, borderLeftColor: '#534AB7',
  },
  emergencyIcon: { fontSize: 26, marginRight: 14 },
  emergencyTitle: { fontSize: 14, fontWeight: '700', color: '#534AB7' },
  emergencyBalance: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  emergencyArrow: { fontSize: 22, color: '#534AB7', fontWeight: '300' },
  skeletonCard: {
    height: 100, backgroundColor: Colors.border, borderRadius: 16,
    marginBottom: 16, opacity: 0.4,
  },
  skeletonPot: {
    width: CELL_WIDTH, height: 160, backgroundColor: Colors.border,
    borderRadius: 14, opacity: 0.3, marginBottom: 12,
  },
})
