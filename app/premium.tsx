import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'
import { useAuthStore } from '../stores/useAuthStore'

type FeatureRow = {
  label: string
  free: string
  premium: string
  freeOk: boolean
  premiumOk: boolean
}

const FEATURES: FeatureRow[] = [
  { label: 'Potes',                  free: 'Até 10',      premium: 'Ilimitado',    freeOk: true,  premiumOk: true },
  { label: 'Metas',                  free: 'Até 5',       premium: 'Ilimitado',    freeOk: true,  premiumOk: true },
  { label: 'Cartões de crédito',     free: 'Até 2',       premium: 'Ilimitado',    freeOk: true,  premiumOk: true },
  { label: 'Fontes de receita',      free: 'Até 3',       premium: 'Ilimitado',    freeOk: true,  premiumOk: true },
  { label: 'Histórico de ciclos',    free: '3 meses',     premium: 'Ilimitado',    freeOk: true,  premiumOk: true },
  { label: 'Tokens de IA por mês',   free: '2 tokens',    premium: '10 tokens',    freeOk: true,  premiumOk: true },
  { label: 'Módulo IR (Deduções)',   free: '',            premium: '',             freeOk: false, premiumOk: true },
  { label: 'Exportação Excel',       free: '',            premium: '',             freeOk: false, premiumOk: true },
  { label: 'Exportação PDF',         free: '',            premium: '',             freeOk: true,  premiumOk: true },
  { label: 'OCR de cupom fiscal',    free: '',            premium: '',             freeOk: true,  premiumOk: true },
  { label: 'Suporte',                free: 'Comunidade',  premium: 'Prioritário',  freeOk: true,  premiumOk: true },
]

const TOKEN_PACKS = [
  { tokens: 5,  price: 'R$ 4,90',  badge: null },
  { tokens: 15, price: 'R$ 9,90',  badge: 'Mais popular' },
  { tokens: 40, price: 'R$ 19,90', badge: 'Melhor valor' },
]

function handleSubscribe() {
  Alert.alert(
    'Em breve disponível',
    'Cadastrar seu interesse?',
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sim',
        onPress: () =>
          Alert.alert('Obrigado!', 'Seu interesse foi registrado. Avisaremos quando o Premium estiver disponível.'),
      },
    ]
  )
}

export default function PremiumScreen() {
  const { isPremium } = useAuthStore()
  const insets = useSafeAreaInsets()
  const footerHeight = insets.bottom + 88

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Planos</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: footerHeight + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Cards de plano */}
        <View style={styles.cardsRow}>
          {/* Card Free */}
          <View style={styles.cardFree}>
            {!isPremium && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>Seu plano</Text>
              </View>
            )}
            <Text style={styles.cardPlanName}>Gratuito</Text>
            <Text style={styles.cardPrice}>R$ 0</Text>
            <Text style={styles.cardSub}>Para começar{'\n'}a organizar</Text>
          </View>

          {/* Card Premium */}
          <View style={styles.cardPremium}>
            <View style={styles.recommendedBadge}>
              <Text style={styles.recommendedText}>⭐ Recomendado</Text>
            </View>
            <Text style={styles.cardPlanNamePremium}>Premium</Text>
            <Text style={styles.cardPricePremium}>R$ 14,90<Text style={styles.cardPriceUnit}>/mês</Text></Text>
            <Text style={styles.cardSubPremium}>Controle financeiro{'\n'}completo</Text>
            <View style={styles.annualBadge}>
              <Text style={styles.annualText}>2 meses grátis no anual</Text>
              <Text style={styles.annualPrice}>R$ 119/ano</Text>
            </View>
          </View>
        </View>

        {/* Tabela comparativa */}
        <Text style={styles.sectionTitle}>O que está incluído</Text>
        <View style={styles.table}>
          {/* Cabeçalho */}
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.colFeature, styles.colHeaderText]}>Funcionalidade</Text>
            <Text style={[styles.colPlan, styles.colHeaderText]}>Free</Text>
            <Text style={[styles.colPlan, styles.colHeaderPremium]}>Premium</Text>
          </View>

          {FEATURES.map((f, i) => (
            <View key={f.label} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              <Text style={styles.colFeature}>{f.label}</Text>

              {/* Coluna Free */}
              <View style={styles.colPlan}>
                {f.free ? (
                  <Text style={styles.cellText}>{f.free}</Text>
                ) : (
                  <Text style={[styles.cellIcon, f.freeOk ? styles.iconOk : styles.iconNo]}>
                    {f.freeOk ? '✅' : '❌'}
                  </Text>
                )}
              </View>

              {/* Coluna Premium */}
              <View style={styles.colPlan}>
                {f.premium ? (
                  <Text style={[styles.cellText, styles.cellTextPremium]}>{f.premium}</Text>
                ) : (
                  <Text style={[styles.cellIcon, f.premiumOk ? styles.iconOk : styles.iconNo]}>
                    {f.premiumOk ? '✅' : '❌'}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Pacotes de tokens */}
        <Text style={styles.sectionTitle}>💡 Precisa de mais IA?</Text>
        <Text style={styles.sectionSub}>Compre tokens avulsos — não expiram nunca</Text>
        <View style={styles.tokenRow}>
          {TOKEN_PACKS.map(pack => (
            <View key={pack.tokens} style={[styles.tokenCard, pack.badge === 'Mais popular' && styles.tokenCardPopular]}>
              {pack.badge && (
                <View style={[styles.tokenBadge, pack.badge === 'Mais popular' ? styles.tokenBadgePopular : styles.tokenBadgeBest]}>
                  <Text style={styles.tokenBadgeText}>{pack.badge}</Text>
                </View>
              )}
              <Text style={styles.tokenCount}>{pack.tokens}</Text>
              <Text style={styles.tokenLabel}>tokens</Text>
              <Text style={styles.tokenPrice}>{pack.price}</Text>
              <TouchableOpacity
                style={styles.tokenBtn}
                onPress={() => Alert.alert('Em breve disponível', 'Esta funcionalidade estará disponível em breve!')}
                activeOpacity={0.8}
              >
                <Text style={styles.tokenBtnText}>Comprar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      {/* Botão fixo no rodapé */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {isPremium ? (
          <View style={styles.btnPremiumActive}>
            <Text style={styles.btnPremiumActiveText}>✅ Você já é Premium</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.btnSubscribe} onPress={handleSubscribe} activeOpacity={0.85}>
            <Text style={styles.btnSubscribeText}>Assinar Premium — R$ 14,90/mês</Text>
            <Text style={styles.btnSubscribeSub}>ou R$ 119/ano (2 meses grátis)</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  backText: { fontSize: 26, color: Colors.primary, fontWeight: '400', lineHeight: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textDark },

  container: { padding: 16 },

  // Cards
  cardsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },

  cardFree: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 14,
    alignItems: 'center',
  },
  cardPremium: {
    flex: 1,
    backgroundColor: Colors.lightBlue,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.primary,
    padding: 14,
    alignItems: 'center',
  },

  currentBadge: {
    backgroundColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  currentBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },

  recommendedBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  recommendedText: { fontSize: 10, fontWeight: '700', color: Colors.white },

  cardPlanName: { fontSize: 16, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },
  cardPlanNamePremium: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginBottom: 4 },

  cardPrice: { fontSize: 22, fontWeight: '800', color: Colors.textDark, marginBottom: 4 },
  cardPricePremium: { fontSize: 22, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
  cardPriceUnit: { fontSize: 13, fontWeight: '500' },

  cardSub: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },
  cardSubPremium: { fontSize: 11, color: Colors.primary, textAlign: 'center', lineHeight: 16, marginBottom: 10 },

  annualBadge: {
    backgroundColor: Colors.primary + '15',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    marginTop: 4,
  },
  annualText: { fontSize: 9, color: Colors.primary, fontWeight: '600' },
  annualPrice: { fontSize: 12, color: Colors.primary, fontWeight: '800', marginTop: 1 },

  // Section
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },
  sectionSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },

  // Table
  table: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  tableHeaderRow: {
    backgroundColor: Colors.primary + '12',
    paddingVertical: 10,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tableRowAlt: { backgroundColor: Colors.background },
  colFeature: { flex: 1.6, fontSize: 12, color: Colors.textDark, fontWeight: '400' },
  colHeaderText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' },
  colHeaderPremium: { fontSize: 11, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  colPlan: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  cellTextPremium: { color: Colors.primary, fontWeight: '600' },
  cellIcon: { fontSize: 14 },
  iconOk: {},
  iconNo: {},

  // Token packs
  tokenRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tokenCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 10,
    alignItems: 'center',
  },
  tokenCardPopular: {
    borderColor: Colors.primary,
    backgroundColor: Colors.lightBlue,
  },
  tokenBadge: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginBottom: 6,
  },
  tokenBadgePopular: { backgroundColor: Colors.primary },
  tokenBadgeBest: { backgroundColor: Colors.success },
  tokenBadgeText: { fontSize: 8, fontWeight: '800', color: Colors.white },
  tokenCount: { fontSize: 22, fontWeight: '800', color: Colors.textDark },
  tokenLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  tokenPrice: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 8 },
  tokenBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: '100%',
    alignItems: 'center',
  },
  tokenBtnText: { fontSize: 11, fontWeight: '700', color: Colors.white },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  btnSubscribe: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnSubscribeText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  btnSubscribeSub: { fontSize: 11, color: Colors.white + 'CC', marginTop: 3 },
  btnPremiumActive: {
    backgroundColor: Colors.success + '20',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.success,
  },
  btnPremiumActiveText: { fontSize: 15, fontWeight: '700', color: Colors.success },
})
