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
import { IncomeSourcesModal } from '../../components/IncomeSourcesModal'
import { Toast } from '../../components/Toast'
import { brl } from '../../lib/finance'
import { BadgeToast } from '../../components/BadgeToast'
import { checkAndGrantBadges, getEarnedBadgeKeys, ALL_BADGES, Badge } from '../../lib/badges'

function initials(name: string): string {
  return name.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function ProfileScreen() {
  const { user, setUser, signOut } = useAuthStore()

  const [potCount, setPotCount] = useState(0)
  const [goalsTotal, setGoalsTotal] = useState(0)
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
  const [cicloInput, setCicloInput] = useState('')
  const [toast, setToast] = useState<{ message: string; color: string } | null>(null)

  const loadStats = useCallback(async () => {
    if (!user) return
    const [{ data: pots }, { data: goals }, { data: authData }] = await Promise.all([
      supabase.from('pots').select('id').eq('user_id', user.id),
      supabase.from('goals').select('current_amount').eq('user_id', user.id),
      supabase.auth.getUser(),
    ])
    setPotCount((pots ?? []).length)
    setGoalsTotal(((goals ?? []) as any[]).reduce((s: number, g: any) => s + Number(g.current_amount), 0))
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

  const handleLimparDados = () => {
    Alert.alert(
      'Limpar dados de teste',
      'Isso irá excluir TODAS as transações do seu perfil. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir tudo', style: 'destructive',
          onPress: async () => {
            if (!user) return
            await supabase.from('transactions').delete().eq('user_id', user.id)
            setToast({ message: 'Transações excluídas.', color: Colors.textMuted })
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
          label: 'Exportar dados',
          icon: '📊',
          onPress: () => Alert.alert('Em breve', 'A exportação de dados estará disponível em uma próxima versão.'),
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
            <Text style={styles.statLabel}>Saldo inicial</Text>
            <Text style={styles.statValue}>{brl(user?.initial_balance ?? 0)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Potes ativos</Text>
            <Text style={styles.statValue}>{potCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Em metas</Text>
            <Text style={styles.statValue}>{brl(goalsTotal)}</Text>
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
