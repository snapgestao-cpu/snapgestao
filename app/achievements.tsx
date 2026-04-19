import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import { ALL_BADGES, Badge } from '../lib/badges'

export default function AchievementsScreen() {
  const { user } = useAuthStore()
  const [earnedKeys, setEarnedKeys] = useState<Set<string>>(new Set())
  const [monthReceiptCount, setMonthReceiptCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)

    const today = new Date()
    const day = today.getDate()
    const cs = user.cycle_start ?? 1
    let sm = today.getMonth(); let sy = today.getFullYear()
    if (day < cs) { sm -= 1; if (sm < 0) { sm = 11; sy -= 1 } }
    const start = new Date(sy, sm, cs).toISOString().split('T')[0]
    let em = sm + 1; let ey = sy
    if (em > 11) { em = 0; ey += 1 }
    const end = new Date(ey, em, cs - 1).toISOString().split('T')[0]

    const [{ data: badges }, { data: receipts }] = await Promise.all([
      supabase.from('user_badges').select('badge_key').eq('user_id', user.id),
      supabase.from('receipts').select('id').eq('user_id', user.id)
        .gte('created_at', start + 'T00:00:00').lte('created_at', end + 'T23:59:59'),
    ])

    setEarnedKeys(new Set((badges ?? []).map((b: any) => b.badge_key)))
    setMonthReceiptCount((receipts ?? []).length)
    setLoading(false)
  }

  const earned = ALL_BADGES.filter(b => earnedKeys.has(b.key))
  const locked = ALL_BADGES.filter(b => !earnedKeys.has(b.key))
  const total = ALL_BADGES.length
  const progress = total > 0 ? earned.length / total : 0

  const challengeProgress = Math.min(monthReceiptCount, 5)
  const challengeDone = earnedKeys.has('detetive_de_gastos')
  const monthName = new Date().toLocaleString('pt-BR', { month: 'long' })

  function BadgeCard({ badge, isEarned }: { badge: Badge; isEarned: boolean }) {
    return (
      <View style={[styles.badgeCard, !isEarned && styles.badgeCardLocked, { borderColor: badge.color + '40' }]}>
        <Text style={[styles.badgeIcon, !isEarned && styles.iconLocked]}>{badge.icon}</Text>
        <Text style={[styles.badgeName, !isEarned && styles.textLocked]} numberOfLines={2}>
          {badge.name}
        </Text>
        <Text style={[styles.badgeDesc, !isEarned && styles.textLocked]} numberOfLines={2}>
          {badge.description}
        </Text>
        <View style={[styles.badgePill, { backgroundColor: isEarned ? badge.color + '20' : Colors.border }]}>
          <Text style={[styles.badgePillText, { color: isEarned ? badge.color : Colors.textMuted }]}>
            {isEarned ? 'Conquistada ✓' : 'Bloqueada 🔒'}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Conquistas 🏆</Text>
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>{earned.length} de {total}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {/* Summary card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Progresso geral</Text>
            <Text style={styles.summaryCount}>{earned.length} conquistadas</Text>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
            </View>
            <Text style={styles.summaryHint}>
              {earned.length === total
                ? '🎉 Parabéns! Você conquistou todos os badges!'
                : `Continue assim! Faltam ${total - earned.length} conquista${total - earned.length !== 1 ? 's' : ''}`}
            </Text>
          </View>

          {/* Challenge do mês */}
          {!challengeDone && (
            <View style={styles.challengeCard}>
              <Text style={styles.challengeTitle}>
                🎯 Desafio de {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
              </Text>
              <Text style={styles.challengeDesc}>Escaneie 5 cupons este mês</Text>
              <View style={styles.challengeProgress}>
                <View style={styles.challengeBarBg}>
                  <View style={[styles.challengeBarFill, { width: `${(challengeProgress / 5) * 100}%` as any }]} />
                </View>
                <Text style={styles.challengeCount}>{challengeProgress}/5</Text>
              </View>
              <Text style={styles.challengeReward}>Recompensa: badge Detetive de Gastos 🔍</Text>
            </View>
          )}

          {/* Earned badges */}
          {earned.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Conquistadas ({earned.length})</Text>
              <FlatList
                data={earned}
                numColumns={2}
                keyExtractor={b => b.key}
                scrollEnabled={false}
                columnWrapperStyle={styles.row}
                renderItem={({ item }) => <BadgeCard badge={item} isEarned />}
              />
            </>
          )}

          {/* Locked badges */}
          {locked.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: earned.length > 0 ? 20 : 0 }]}>
                Bloqueadas ({locked.length})
              </Text>
              <FlatList
                data={locked}
                numColumns={2}
                keyExtractor={b => b.key}
                scrollEnabled={false}
                columnWrapperStyle={styles.row}
                renderItem={({ item }) => <BadgeCard badge={item} isEarned={false} />}
              />
            </>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, marginRight: 8 },
  backArrow: { fontSize: 28, color: Colors.primary, fontWeight: '300', lineHeight: 32 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: Colors.textDark },
  counterBadge: {
    backgroundColor: Colors.lightBlue, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  counterText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  container: { padding: 16 },
  summaryCard: {
    backgroundColor: Colors.primary, borderRadius: 16,
    padding: 20, marginBottom: 16,
  },
  summaryTitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  summaryCount: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 12 },
  progressBg: {
    height: 8, backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 4, overflow: 'hidden', marginBottom: 10,
  },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 4 },
  summaryHint: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  challengeCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    padding: 16, marginBottom: 16,
    borderWidth: 2, borderColor: '#BA751730',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  challengeTitle: { fontSize: 15, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },
  challengeDesc: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
  challengeProgress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  challengeBarBg: {
    flex: 1, height: 8, backgroundColor: Colors.background,
    borderRadius: 4, overflow: 'hidden',
  },
  challengeBarFill: { height: '100%', backgroundColor: '#0F5EA8', borderRadius: 4 },
  challengeCount: { fontSize: 13, fontWeight: '700', color: Colors.primary, width: 30 },
  challengeReward: { fontSize: 11, color: Colors.textMuted },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  row: { gap: 10, marginBottom: 10 },
  badgeCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 16,
    padding: 14, alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  badgeCardLocked: { backgroundColor: Colors.background },
  badgeIcon: { fontSize: 36, marginBottom: 8 },
  iconLocked: { opacity: 0.3 },
  badgeName: {
    fontSize: 12, fontWeight: '700', color: Colors.textDark,
    textAlign: 'center', marginBottom: 4,
  },
  badgeDesc: {
    fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginBottom: 8,
  },
  textLocked: { opacity: 0.5 },
  badgePill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  badgePillText: { fontSize: 9, fontWeight: '600' },
})
