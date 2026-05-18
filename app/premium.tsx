import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'

const BENEFITS = [
  { feature: 'Potes',              free: '10 potes',        premium: 'Ilimitados' },
  { feature: 'Metas',              free: '5 metas',         premium: 'Ilimitadas' },
  { feature: 'Cartões de crédito', free: '2 cartões',       premium: 'Ilimitados' },
  { feature: 'Fontes de receita',  free: '3 fontes',        premium: 'Ilimitadas' },
  { feature: 'Tokens de IA/mês',   free: '2 tokens',        premium: '10 tokens' },
  { feature: 'Histórico de ciclos',free: '3 meses',         premium: 'Completo' },
  { feature: 'Exportação Excel',   free: '✕',               premium: '✓' },
  { feature: 'Módulo IR',          free: '✕',               premium: '✓' },
]

export default function PremiumScreen() {
  const { isPremium } = useAuthStore()

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Voltar</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <Text style={styles.heroIcon}>⭐</Text>
          <Text style={styles.heroTitle}>SnapGestão Premium</Text>
          <Text style={styles.heroSubtitle}>
            Desbloqueie tudo e tenha o controle financeiro completo
          </Text>
          {isPremium && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>✓ Plano ativo</Text>
            </View>
          )}
        </View>

        {/* Tabela de benefícios */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.featureCell, styles.headerText]}>Funcionalidade</Text>
            <Text style={[styles.tableCellCenter, styles.headerText]}>Gratuito</Text>
            <Text style={[styles.tableCellCenter, styles.headerTextPremium]}>Premium ⭐</Text>
          </View>
          {BENEFITS.map((b, i) => (
            <View key={b.feature} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
              <Text style={[styles.tableCell, styles.featureCell]}>{b.feature}</Text>
              <Text style={[styles.tableCellCenter, styles.freeValue]}>{b.free}</Text>
              <Text style={[styles.tableCellCenter, styles.premiumValue]}>{b.premium}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        {!isPremium && (
          <TouchableOpacity
            style={styles.ctaBtn}
            activeOpacity={0.85}
            onPress={() =>
              Alert.alert(
                '⭐ Em breve!',
                'O plano Premium estará disponível em breve. Seu interesse foi registrado!',
                [{ text: 'OK' }]
              )
            }
          >
            <Text style={styles.ctaBtnText}>Em breve — cadastre seu interesse</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20 },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 16, color: Colors.primary, fontWeight: '600' },
  hero: { alignItems: 'center', paddingVertical: 24 },
  heroIcon: { fontSize: 56, marginBottom: 8 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: Colors.textDark, marginBottom: 6 },
  heroSubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  activeBadge: {
    marginTop: 12,
    backgroundColor: Colors.success + '20',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  activeBadgeText: { fontSize: 13, fontWeight: '700', color: Colors.success },
  table: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  tableRowAlt: { backgroundColor: Colors.background },
  tableHeader: { backgroundColor: Colors.primary + '10', paddingVertical: 12 },
  tableCell: { flex: 1.4, fontSize: 13, color: Colors.textDark },
  featureCell: { fontWeight: '500' },
  tableCellCenter: { flex: 1, fontSize: 12, textAlign: 'center' },
  headerText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  headerTextPremium: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  freeValue: { color: Colors.textMuted },
  premiumValue: { color: Colors.primary, fontWeight: '700' },
  ctaBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
})
