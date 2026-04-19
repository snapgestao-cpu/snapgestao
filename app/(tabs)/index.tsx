import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  RefreshControl, TouchableOpacity, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { JarPot } from '../../components/JarPot'
import { NewPotModal } from '../../components/NewPotModal'
import { BadgeToast } from '../../components/BadgeToast'
import { Badge } from '../../lib/badges'
import { Toast } from '../../components/Toast'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import { getCycle } from '../../lib/cycle'
import { Pot } from '../../types'
import { brl } from '../../lib/finance'

const CELL_WIDTH = (Dimensions.get('window').width - 32) / 2

type PotRow = {
  pot: Pot
  spent: number
  remaining: number
  percent: number
}

export default function PotsScreen() {
  const { user } = useAuthStore()

  const [potsData, setPotsData] = useState<PotRow[]>([])
  const [emergencyPot, setEmergencyPot] = useState<Pot | null>(null)
  const [emergencyBalance, setEmergencyBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [showNewPot, setShowNewPot] = useState(false)
  const [editingPot, setEditingPot] = useState<Pot | null>(null)
  const [totalIncome, setTotalIncome] = useState(0)
  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])

  const loadPots = useCallback(async () => {
    if (!user) return
    try {
      const cycle = getCycle(user.cycle_start ?? 1, 0)

      const [sourcesRes, potsRes, epRes] = await Promise.all([
        supabase.from('income_sources').select('amount').eq('user_id', user.id),
        supabase.from('pots').select('*')
          .eq('user_id', user.id)
          .eq('is_emergency', false)
          .is('deleted_at', null)
          .lte('created_at', cycle.end.toISOString())
          .order('created_at', { ascending: true }),
        supabase.from('pots').select('*')
          .eq('user_id', user.id).eq('is_emergency', true)
          .is('deleted_at', null).maybeSingle(),
      ])

      const income = ((sourcesRes.data ?? []) as any[])
        .reduce((s, r) => s + Number(r.amount), 0)
      setTotalIncome(income)

      const pots = (potsRes.data ?? []) as Pot[]
      const ep = epRes.data as Pot | null
      setEmergencyPot(ep)

      const rows: PotRow[] = await Promise.all(
        pots.map(async (pot) => {
          const { data: txs } = await supabase
            .from('transactions').select('amount')
            .eq('pot_id', pot.id).eq('type', 'expense')
            .gte('date', cycle.startISO).lte('date', cycle.endISO)
          const spent = ((txs ?? []) as any[]).reduce((s, t) => s + Number(t.amount), 0)
          const limit = pot.limit_amount ?? 0
          const remaining = limit - spent
          const percent = limit > 0 ? (spent / limit) * 100 : 0
          return { pot, spent, remaining, percent }
        })
      )
      setPotsData(rows)

      if (ep) {
        const { data: epTxs } = await supabase
          .from('transactions').select('amount,type').eq('pot_id', ep.id)
        const bal = ((epTxs ?? []) as any[]).reduce((s: number, t: any) =>
          t.type === 'income' ? s + Number(t.amount) : s - Number(t.amount), 0)
        setEmergencyBalance(bal)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => { setLoading(true); loadPots() }, [loadPots])

  const onRefresh = () => { setRefreshing(true); loadPots() }

  const handleSuccess = (msg: string) => {
    loadPots()
    setToast({ message: msg, color: Colors.primary })
  }

  const cycle = user ? getCycle(user.cycle_start ?? 1, 0) : null

  const renderItem = ({ item }: { item: PotRow }) => (
    <TouchableOpacity
      style={{ width: CELL_WIDTH, alignItems: 'center', paddingBottom: 20, paddingHorizontal: 8 }}
      onPress={() => router.push(`/pot/${item.pot.id}`)}
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
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {user?.name?.split(' ')[0] ?? 'usuário'} 👋</Text>
          <Text style={styles.monthLabel}>
            {cycle ? cycle.monthYear : ''}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {cycle && (
            <View style={styles.cycleBadge}>
              <Text style={styles.cycleBadgeText}>{cycle.label}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.newPotBtn} onPress={() => setShowNewPot(true)}>
            <Text style={styles.newPotBtnText}>+ Pote</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
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
                onPress={() => router.push(`/pot/${emergencyPot.id}`)}
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

      <NewPotModal
        visible={showNewPot}
        onClose={() => setShowNewPot(false)}
        onSuccess={handleSuccess}
        onBadges={setPendingBadges}
        totalIncome={totalIncome}
      />
      <NewPotModal
        visible={!!editingPot}
        onClose={() => setEditingPot(null)}
        onSuccess={handleSuccess}
        editPot={editingPot ?? undefined}
        totalIncome={totalIncome}
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    backgroundColor: Colors.background,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: Colors.textDark },
  monthLabel: { fontSize: 14, color: Colors.textMuted, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  cycleBadge: {
    backgroundColor: Colors.lightBlue, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  cycleBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  newPotBtn: {
    backgroundColor: Colors.primary, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  newPotBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
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
})
