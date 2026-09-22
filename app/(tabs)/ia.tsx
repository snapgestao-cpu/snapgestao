/**
 * Aba IA — hub de inteligência do app (Parte 1).
 * Reúne: resumo semanal ("check-in do CFO"), o chat "Fale com seu CFO" (Fase 3a),
 * e atalhos para as ferramentas de IA existentes (Mentor Financeiro, Analisador de
 * Preços). O card de resumo reaproveita lib/weekly-insight.ts.
 */
import React, { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { Colors } from '../../constants/colors'
import { useAuthStore } from '../../stores/useAuthStore'
import { getOrGenerateWeeklyInsight } from '../../lib/weekly-insight'

export default function IAScreen() {
  const { user } = useAuthStore()
  const [weekly, setWeekly] = useState<string | null>(null)
  const [weeklyLoading, setWeeklyLoading] = useState(true)

  const loadWeekly = useCallback(() => {
    if (!user) return
    setWeeklyLoading(true)
    getOrGenerateWeeklyInsight(user.id, user.plan ?? 'free', user.cycle_start ?? 1)
      .then(c => { setWeekly(c); setWeeklyLoading(false) })
      .catch(() => { setWeekly(''); setWeeklyLoading(false) })
  }, [user?.id, user?.plan, user?.cycle_start])

  // Recarrega o resumo ao focar a aba (cache reaproveitado se já gerado na semana).
  useFocusEffect(useCallback(() => { loadWeekly() }, [loadWeekly]))

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>🤖 IA</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Resumo da semana */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Resumo da Semana</Text>
          <Text style={styles.cardDesc}>Um check-in curto do seu dinheiro nos últimos 7 dias.</Text>
          {weeklyLoading ? (
            <View style={styles.weeklyLoading}><ActivityIndicator color={Colors.primary} /></View>
          ) : weekly ? (
            <Text style={styles.weeklyText}>{weekly}</Text>
          ) : (
            <Text style={styles.weeklyEmpty}>🗓️ Sem resumo esta semana ainda — registre alguns gastos e volte.</Text>
          )}
        </View>

        {/* Fale com seu CFO (Fase 3a) */}
        <TouchableOpacity style={styles.actionCard} activeOpacity={0.8} onPress={() => router.push('/chat')}>
          <Text style={styles.actionEmoji}>💬</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Fale com seu CFO</Text>
            <Text style={styles.actionDesc}>Pergunte sobre seus gastos, potes e preços. Responde com base nos seus dados.</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        {/* Atalhos para as ferramentas de IA existentes */}
        <Text style={styles.sectionLabel}>Ferramentas</Text>

        <TouchableOpacity style={styles.actionCard} activeOpacity={0.8} onPress={() => router.push('/mentor')}>
          <Text style={styles.actionEmoji}>🧭</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Mentor Financeiro</Text>
            <Text style={styles.actionDesc}>Diagnóstico completo com plano de ação, a partir de um quiz rápido.</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} activeOpacity={0.8} onPress={() => router.push('/analisador-precos')}>
          <Text style={styles.actionEmoji}>🔍</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Analisador de Preços</Text>
            <Text style={styles.actionDesc}>Compara os preços dos seus itens com a base colaborativa.</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textDark },
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.textDark },
  cardDesc: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2, marginBottom: 12, lineHeight: 16 },
  weeklyLoading: { paddingVertical: 16, alignItems: 'center' },
  weeklyText: { fontSize: 13, color: Colors.textDark, lineHeight: 20 },
  weeklyEmpty: { fontSize: 13, color: Colors.textMuted, lineHeight: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginTop: 8, marginLeft: 4, textTransform: 'uppercase' },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  actionEmoji: { fontSize: 26 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  actionDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  chevron: { fontSize: 22, color: Colors.textMuted },
})
