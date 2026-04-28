import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Switch, RefreshControl, Modal, TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import { CreditCardModal } from '../../components/CreditCardModal'
import { ExportExcelModal } from '../../components/ExportExcelModal'
import { IncomeSourcesModal } from '../../components/IncomeSourcesModal'
import { Toast } from '../../components/Toast'
import { brl } from '../../lib/finance'
import { getCycle } from '../../lib/cycle'
import { calculateCycleSummary } from '../../lib/cycleClose'
import { Goal } from '../../types'
import { BadgeToast } from '../../components/BadgeToast'
import { checkAndGrantBadges, getEarnedBadgeKeys, ALL_BADGES, Badge } from '../../lib/badges'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'

function initials(name: string): string {
  return name.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function ProfileScreen() {
  const { user, setUser, signOut } = useAuthStore()

  const [cycleSaldo, setCycleSaldo] = useState(0)
  const [activeGoalsCount, setActiveGoalsCount] = useState(0)
  const [priorityGoal, setPriorityGoal] = useState<Goal | null>(null)
  const [email, setEmail] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [earnedCount, setEarnedCount] = useState(0)
  const [previewBadges, setPreviewBadges] = useState<Badge[]>([])
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])

  // Notification toggles (local state only)
  const [notifGasto, setNotifGasto] = useState(false)
  const [notifCiclo, setNotifCiclo] = useState(false)
  const [notifIncentivo, setNotifIncentivo] = useState(false)

  // Modals
  const [showCards, setShowCards] = useState(false)
  const [showIncomeSources, setShowIncomeSources] = useState(false)
  const [showCicloEdit, setShowCicloEdit] = useState(false)
  const [showExportExcel, setShowExportExcel] = useState(false)
  const [cicloInput, setCicloInput] = useState('')
  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)

  const loadStats = useCallback(async () => {
    if (!user) return
    const [{ data: goalsData }, { data: authData }] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', user.id),
      supabase.auth.getUser(),
    ])

    const cycle = getCycle(user.cycle_start ?? 1, 0)
    const summary = await calculateCycleSummary(user.id, cycle)
    setCycleSaldo(summary.cycleSaldo)

    const allGoals = (goalsData ?? []) as Goal[]
    const activeGoals = allGoals.filter(g => Number(g.current_amount) < Number(g.target_amount))
    setActiveGoalsCount(activeGoals.length)

    const today = new Date().toISOString().split('T')[0]
    const withDate = activeGoals
      .filter(g => g.target_date != null && g.target_date >= today)
      .sort((a, b) => a.target_date!.localeCompare(b.target_date!))
    if (withDate.length > 0) {
      setPriorityGoal(withDate[0])
    } else if (activeGoals.length > 0) {
      setPriorityGoal(activeGoals.reduce((best, g) =>
        (Number(g.current_amount) / Number(g.target_amount)) > (Number(best.current_amount) / Number(best.target_amount)) ? g : best
      ))
    } else {
      setPriorityGoal(null)
    }

    setEmail((authData as any)?.user?.email ?? '')
    const earnedKeys = await getEarnedBadgeKeys(user.id)
    setEarnedCount(earnedKeys.size)
    setPreviewBadges(ALL_BADGES.filter(b => earnedKeys.has(b.key)).slice(0, 3))
    setRefreshing(false)
  }, [user?.id])

  useEffect(() => { loadStats() }, [loadStats])

  const onRefresh = () => { setRefreshing(true); loadStats() }

  const handleSignOut = () => {
    Alert.alert('Sair', 'Deseja realmente sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const handleSaveCiclo = async () => {
    const day = Number(cicloInput)
    if (!day || day < 1 || day > 28) {
      Alert.alert('Inválido', 'Informe um dia entre 1 e 28.')
      return
    }
    if (!user) return
    const { error } = await supabase.from('users').update({ cycle_start: day }).eq('id', user.id)
    if (error) { setToast({ message: 'Erro ao salvar.', color: Colors.danger }); return }
    setUser({ ...user, cycle_start: day })
    setShowCicloEdit(false)
    setToast({ message: 'Ciclo atualizado!', color: Colors.success })
  }

  const handleExportarIR = async () => {
    if (!user) return
    try {
      const ano = new Date().getFullYear() - 1
      const { data: txs } = await supabase
        .from('transactions')
        .select('date, description, merchant, amount, type, pot_id')
        .eq('user_id', user.id)
        .gte('date', `${ano}-01-01`)
        .lte('date', `${ano}-12-31`)
        .order('date', { ascending: true })

      const { data: pots } = await supabase.from('pots').select('id, name').eq('user_id', user.id)
      const potMap = Object.fromEntries(((pots ?? []) as any[]).map((p: any) => [p.id, p.name]))

      const header = 'Data,Descrição,Estabelecimento,Pote,Tipo,Valor (R$)\n'
      const lines = ((txs ?? []) as any[]).map((t: any) => {
        const desc = (t.description ?? '').replace(/,/g, ';')
        const merchant = (t.merchant ?? '').replace(/,/g, ';')
        const potName = t.pot_id ? (potMap[t.pot_id] ?? '') : ''
        const tipo = t.type === 'income' ? 'Receita' : 'Despesa'
        const valor = t.type === 'income' ? t.amount : -t.amount
        return `${t.date},"${desc}","${merchant}","${potName}",${tipo},${Number(valor).toFixed(2)}`
      }).join('\n')

      const csv = header + lines
      const path = FileSystem.cacheDirectory + `IR_${ano}_SnapGestao.csv`
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 })

      const canShare = await Sharing.isAvailableAsync()
      if (canShare) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: `Exportar IR ${ano}` })
      } else {
        Alert.alert('Exportado', `Arquivo salvo em:\n${path}`)
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível exportar.')
    }
  }

  const handleLimparDados = () => {
    Alert.alert(
      'Limpar todos os dados',
      'Isso vai apagar PERMANENTEMENTE todos os seus potes, metas, lançamentos e histórico. Esta ação não pode ser desfeita. Confirmar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar tudo', style: 'destructive',
          onPress: async () => {
            const userId = useAuthStore.getState().user?.id
            if (!userId) return
            try {
              await supabase.from('transactions').delete().eq('user_id', userId)
              await supabase.from('pots').delete().eq('user_id', userId)
              await supabase.from('goals').delete().eq('user_id', userId)
              await supabase.from('income_sources').delete().eq('user_id', userId)
              await supabase.from('cycle_rollovers').delete().eq('user_id', userId)
              await supabase.from('projection_entries').delete().eq('user_id', userId)
              await supabase.from('smart_merchants').delete().eq('user_id', userId)
              await supabase.from('user_badges').delete().eq('user_id', userId)
              await supabase.from('receipts').delete().eq('user_id', userId)
              await supabase.from('pot_limit_history').delete().eq('user_id', userId)
              await supabase.from('users').update({ initial_balance: 0, cycle_start: 1, onboarding_completed: false }).eq('id', userId)
              useAuthStore.getState().setUser({
                ...useAuthStore.getState().user!,
                initial_balance: 0,
              })
              Alert.alert(
                'Dados apagados',
                'Todos os dados foram removidos. O app voltará ao onboarding.',
                [{ text: 'OK', onPress: () => router.replace('/onboarding/step1') }]
              )
            } catch {
              Alert.alert('Erro', 'Não foi possível limpar todos os dados. Tente novamente.')
            }
          },
        },
      ]
    )
  }

  const cycleEnd = user?.cycle_start
    ? (user.cycle_start === 1 ? 'fim do mês' : `dia ${user.cycle_start - 1}`)
    : '—'

  type Group = { title: string; items: { label: string; icon: string; value?: string; onPress: () => void; danger?: boolean; toggle?: boolean; toggleValue?: boolean; onToggle?: (v: boolean) => void }[] }

  const groups: Group[] = [
    {
      title: 'Conta',
      items: [
        { label: 'Fontes de receita', icon: '💼', onPress: () => setShowIncomeSources(true) },
        {
          label: 'Ciclo mensal',
          icon: '📅',
          value: user?.cycle_start ? `Dia ${user.cycle_start} ao ${cycleEnd}` : undefined,
          onPress: () => { setCicloInput(String(user?.cycle_start ?? 1)); setShowCicloEdit(true) },
        },
        {
          label: 'Moeda',
          icon: '💱',
          value: user?.currency ?? 'BRL',
          onPress: () => Alert.alert('Moeda', 'Suporte a múltiplas moedas em breve.'),
        },
      ],
    },
    {
      title: 'Potes e Cartões',
      items: [
        { label: 'Meus cartões de crédito', icon: '💳', onPress: () => setShowCards(true) },
        {
          label: 'Modo Mesada',
          icon: '👶',
          onPress: () => {},
          toggle: true,
          toggleValue: false,
          onToggle: () => Alert.alert('Em breve', 'O Modo Mesada estará disponível em uma próxima versão.'),
        },
      ],
    },
    {
      title: 'Notificações',
      items: [
        { label: 'Alerta de gasto crítico', icon: '⚠️', onPress: () => {}, toggle: true, toggleValue: notifGasto, onToggle: setNotifGasto },
        { label: 'Lembrete fim de ciclo', icon: '🔔', onPress: () => {}, toggle: true, toggleValue: notifCiclo, onToggle: setNotifCiclo },
        { label: 'Incentivos e conquistas', icon: '🏆', onPress: () => {}, toggle: true, toggleValue: notifIncentivo, onToggle: setNotifIncentivo },
      ],
    },
    {
      title: 'Dados',
      items: [
        {
          label: 'Exportar lançamentos (Excel)',
          icon: '📋',
          onPress: () => setShowExportExcel(true),
        },
        {
          label: `Exportar IR ${new Date().getFullYear() - 1} (CSV)`,
          icon: '📊',
          onPress: handleExportarIR,
        },
        { label: 'Limpar dados de teste', icon: '🗑', onPress: handleLimparDados, danger: true },
      ],
    },
    {
      title: 'Sobre',
      items: [
        { label: 'Versão 1.0.0', icon: 'ℹ️', onPress: () => {} },
        { label: 'Sair da conta', icon: '🚪', onPress: handleSignOut, danger: true },
      ],
    },
  ]

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name ? initials(user.name) : '?'}</Text>
          </View>
          <Text style={styles.name}>{user?.name ?? '—'}</Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}
          <View style={styles.cycleBadge}>
            <Text style={styles.cycleBadgeText}>
              Ciclo: dia {user?.cycle_start ?? 1} ao {cycleEnd}
            </Text>
          </View>
        </View>

        {/* Summary cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Saldo atual</Text>
            <Text style={[styles.statValue, { color: cycleSaldo >= 0 ? Colors.success : Colors.danger }]}>
              {brl(cycleSaldo)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Metas ativas</Text>
            <Text style={styles.statValue}>{activeGoalsCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel} numberOfLines={1}>
              {priorityGoal ? priorityGoal.name.substring(0, 14) : 'Meta prioritária'}
            </Text>
            {priorityGoal ? (() => {
              const pct = Math.min(Math.round((Number(priorityGoal.current_amount) / Number(priorityGoal.target_amount)) * 100), 100)
              return (
                <>
                  <Text style={[styles.statValue, { color: Colors.primary, fontSize: 18 }]}>{pct}%</Text>
                  <Text style={{ fontSize: 9, color: Colors.textMuted }}>concluído</Text>
                  <View style={{ width: '100%', height: 4, backgroundColor: Colors.border, borderRadius: 2, marginTop: 4 }}>
                    <View style={{ width: `${pct}%`, height: 4, borderRadius: 2, backgroundColor: Colors.primary }} />
                  </View>
                </>
              )
            })() : (
              <Text style={styles.statValue}>—</Text>
            )}
          </View>
        </View>

        {/* Conquistas */}
        <TouchableOpacity
          style={styles.achievementsCard}
          onPress={() => router.push('/achievements')}
          activeOpacity={0.8}
        >
          <View style={styles.achievementsHeader}>
            <Text style={styles.achievementsTitle}>Conquistas 🏆</Text>
            <Text style={styles.achievementsCount}>
              {earnedCount} de {ALL_BADGES.length}
            </Text>
          </View>
          {previewBadges.length > 0 ? (
            <View style={styles.achievementsPreview}>
              {previewBadges.map(b => (
                <View key={b.key} style={[styles.previewPill, { backgroundColor: b.color + '20' }]}>
                  <Text style={styles.previewIcon}>{b.icon}</Text>
                  <Text style={[styles.previewName, { color: b.color }]} numberOfLines={1}>{b.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.achievementsEmpty}>Complete desafios para ganhar badges</Text>
          )}
          <Text style={styles.achievementsLink}>Ver todas →</Text>
        </TouchableOpacity>

        {/* Mentor Financeiro */}
        <TouchableOpacity
          style={styles.mentorCard}
          onPress={() => router.push('/mentor')}
          activeOpacity={0.85}
        >
          <View style={styles.mentorLeft}>
            <View style={styles.mentorIcon}>
              <Text style={styles.mentorIconText}>🤖</Text>
            </View>
            <View style={styles.mentorInfo}>
              <Text style={styles.mentorTitle}>Mentor Financeiro IA</Text>
              <Text style={styles.mentorSub}>Análise personalizada + relatório PDF</Text>
            </View>
          </View>
          <Text style={styles.mentorChevron}>›</Text>
        </TouchableOpacity>

        {/* Analisador de Preços */}
        <TouchableOpacity
          style={styles.analisadorCard}
          onPress={() => router.push('/analisador-precos')}
          activeOpacity={0.85}
        >
          <Text style={styles.analisadorIcon}>🔍</Text>
          <View style={styles.analisadorInfo}>
            <View style={styles.analisadorTitleRow}>
              <Text style={styles.analisadorTitle}>Analisador de Preços</Text>
              <View style={styles.analisadorBadge}>
                <Text style={styles.analisadorBadgeText}>IA</Text>
              </View>
            </View>
            <Text style={styles.analisadorSub}>Compare preços e encontre onde comprar melhor</Text>
          </View>
          <Text style={styles.analisadorChevron}>›</Text>
        </TouchableOpacity>

        {/* Settings groups */}
        {groups.map(group => (
          <View key={group.title} style={styles.groupContainer}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, idx < group.items.length - 1 && styles.menuItemBorder]}
                  onPress={item.toggle ? undefined : item.onPress}
                  activeOpacity={item.toggle ? 1 : 0.7}
                >
                  <Text style={styles.menuIcon}>{item.icon}</Text>
                  <Text style={[styles.menuLabel, item.danger && styles.danger]}>{item.label}</Text>
                  {item.value ? <Text style={styles.menuValue}>{item.value}</Text> : null}
                  {item.toggle ? (
                    <Switch
                      value={item.toggleValue ?? false}
                      onValueChange={item.onToggle}
                      trackColor={{ false: Colors.border, true: Colors.primary }}
                      thumbColor={item.toggleValue ? Colors.primary : '#f4f3f4'}
                    />
                  ) : (
                    <Text style={styles.chevron}>›</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Ciclo edit modal */}
      <Modal visible={showCicloEdit} transparent animationType="fade" onRequestClose={() => setShowCicloEdit(false)}>
        <TouchableOpacity
          style={styles.centeredBackdrop}
          activeOpacity={1}
          onPress={() => setShowCicloEdit(false)}
        >
          <View style={styles.dialogBox}>
            <Text style={styles.dialogTitle}>Dia de início do ciclo</Text>
            <Text style={styles.dialogSub}>Informe um dia de 1 a 28</Text>
            <TextInput
              style={styles.dialogInput}
              value={cicloInput}
              onChangeText={t => setCicloInput(t.replace(/\D/g, '').slice(0, 2))}
              keyboardType="numeric"
              autoFocus
              textAlign="center"
            />
            <View style={styles.dialogBtns}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => setShowCicloEdit(false)}>
                <Text style={styles.dialogCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogConfirm} onPress={handleSaveCiclo}>
                <Text style={styles.dialogConfirmText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <CreditCardModal visible={showCards} onClose={() => setShowCards(false)} />
      {user && (
        <ExportExcelModal
          visible={showExportExcel}
          onClose={() => setShowExportExcel(false)}
          userId={user.id}
        />
      )}
      <IncomeSourcesModal
        visible={showIncomeSources}
        onClose={() => setShowIncomeSources(false)}
        onChanged={loadStats}
      />

      {toast && (
        <Toast message={toast.message} color={toast.color} onHide={() => setToast(null)} />
      )}
      {pendingBadges.length > 0 && (
        <BadgeToast badges={pendingBadges} onDone={() => setPendingBadges([])} />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20 },
  profileHeader: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: '#fff' },
  name: { fontSize: 22, fontWeight: '800', color: Colors.textDark, marginBottom: 2 },
  email: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  cycleBadge: {
    backgroundColor: Colors.lightBlue, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  cycleBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 12,
    padding: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4, textAlign: 'center' },
  statValue: { fontSize: 14, fontWeight: '700', color: Colors.textDark, textAlign: 'center' },
  achievementsCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    padding: 16, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  achievementsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  achievementsTitle: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  achievementsCount: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  achievementsPreview: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  previewIcon: { fontSize: 14 },
  previewName: { fontSize: 11, fontWeight: '600', maxWidth: 80 },
  achievementsEmpty: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },
  achievementsLink: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  mentorCard: {
    backgroundColor: Colors.primary, borderRadius: 16,
    padding: 16, marginBottom: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  mentorLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  mentorIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  mentorIconText: { fontSize: 22 },
  mentorInfo: { flex: 1 },
  mentorTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  mentorSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  mentorChevron: { fontSize: 22, color: 'rgba(255,255,255,0.8)', fontWeight: '300' },
  analisadorCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.accent,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
  },
  analisadorIcon: { fontSize: 24, marginRight: 12 },
  analisadorInfo: { flex: 1 },
  analisadorTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  analisadorTitle: { fontSize: 15, fontWeight: '700', color: Colors.accent },
  analisadorBadge: {
    backgroundColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  analisadorBadgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },
  analisadorSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  analisadorChevron: { fontSize: 16, color: Colors.accent },
  groupContainer: { marginBottom: 20 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  groupCard: {
    backgroundColor: Colors.white, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuIcon: { fontSize: 20, marginRight: 14, width: 28, textAlign: 'center' },
  menuLabel: { flex: 1, fontSize: 15, color: Colors.textDark },
  menuValue: { fontSize: 13, color: Colors.textMuted, marginRight: 8 },
  danger: { color: Colors.danger },
  chevron: { fontSize: 18, color: Colors.textMuted },
  centeredBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  dialogBox: {
    backgroundColor: Colors.white, borderRadius: 20,
    padding: 24, width: 280,
  },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: Colors.textDark, textAlign: 'center', marginBottom: 4 },
  dialogSub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 16 },
  dialogInput: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingVertical: 12, fontSize: 24,
    fontWeight: '700', color: Colors.textDark, marginBottom: 16,
  },
  dialogBtns: { flexDirection: 'row', gap: 10 },
  dialogCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  dialogCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  dialogConfirm: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  dialogConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
})
