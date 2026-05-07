/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Tela de aceite de Termos de Uso e Política de Privacidade (LGPD).
 * Exibida antes do onboarding e sempre que a versão aceita diferir
 * da versão atual (TERMS_VERSION). Bloqueia navegação até aceite.
 */

import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Linking,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'

const TERMS_VERSION = '1.0'

export default function TermsScreen() {
  const { user, setUser } = useAuthStore()
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleAccept = async () => {
    if (!user) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('users')
        .update({ terms_accepted_at: now, terms_version: TERMS_VERSION })
        .eq('id', user.id)
      if (error) { Alert.alert('Erro', error.message); return }

      setUser({ ...user, terms_accepted_at: now, terms_version: TERMS_VERSION })

      if (user.onboarding_completed) {
        router.replace('/(tabs)/monthly')
      } else {
        router.replace('/onboarding/step1')
      }
    } catch (e: any) {
      Alert.alert('Erro', String(e))
    } finally {
      setSaving(false)
    }
  }

  const canAccept = acceptedTerms && acceptedPrivacy

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🫙</Text>
        <Text style={styles.headerTitle}>Bem-vindo ao SnapGestão</Text>
        <Text style={styles.headerSub}>
          Antes de continuar, leia e aceite nossos termos
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Para usar o SnapGestão, você precisa aceitar nossos Termos de Uso e
          Política de Privacidade, em conformidade com a Lei Geral de Proteção
          de Dados (LGPD — Lei nº 13.709/2018).
        </Text>

        {/* Card Termos de Uso */}
        <TouchableOpacity
          style={styles.docCard}
          onPress={() => Linking.openURL('https://snapgestao.app/termos')}
          activeOpacity={0.7}
        >
          <Text style={styles.docIcon}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.docTitle}>Termos de Uso</Text>
            <Text style={styles.docLink}>Toque para ler →</Text>
          </View>
        </TouchableOpacity>

        {/* Card Política de Privacidade */}
        <TouchableOpacity
          style={styles.docCard}
          onPress={() => Linking.openURL('https://snapgestao.app/privacidade')}
          activeOpacity={0.7}
        >
          <Text style={styles.docIcon}>🔒</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.docTitle}>Política de Privacidade</Text>
            <Text style={styles.docLink}>Toque para ler →</Text>
          </View>
        </TouchableOpacity>

        {/* Checkbox Termos de Uso */}
        <TouchableOpacity
          style={[styles.checkRow, acceptedTerms && styles.checkRowActive]}
          onPress={() => setAcceptedTerms(v => !v)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxActive]}>
            {acceptedTerms && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>
            Li e aceito os{' '}
            <Text style={styles.checkLabelBold}>Termos de Uso</Text>
            {' '}do SnapGestão
          </Text>
        </TouchableOpacity>

        {/* Checkbox Política de Privacidade */}
        <TouchableOpacity
          style={[styles.checkRow, acceptedPrivacy && styles.checkRowActive]}
          onPress={() => setAcceptedPrivacy(v => !v)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, acceptedPrivacy && styles.checkboxActive]}>
            {acceptedPrivacy && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>
            Li e aceito a{' '}
            <Text style={styles.checkLabelBold}>Política de Privacidade</Text>
            {' '}e consinto com o tratamento dos meus dados conforme a LGPD
          </Text>
        </TouchableOpacity>

        {/* Aviso LGPD */}
        <View style={styles.lgpdCard}>
          <Text style={styles.lgpdIcon}>ℹ️</Text>
          <Text style={styles.lgpdText}>
            Seus dados financeiros são privados e protegidos. Apenas você tem
            acesso ao seu histórico financeiro. Você pode excluir sua conta e
            todos os dados a qualquer momento.
          </Text>
        </View>
      </ScrollView>

      {/* Botão confirmar */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, !canAccept && styles.btnDisabled]}
          onPress={handleAccept}
          disabled={!canAccept || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              {canAccept ? '✅ Aceitar e continuar' : 'Marque os dois itens acima'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    paddingTop: 24,
    alignItems: 'center',
  },
  headerEmoji: { fontSize: 36, marginBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  headerSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.8)',
    textAlign: 'center', lineHeight: 19,
  },
  scroll: { padding: 24, paddingBottom: 8 },
  intro: {
    fontSize: 14, color: Colors.textMuted,
    lineHeight: 22, marginBottom: 24, textAlign: 'center',
  },
  docCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  docIcon: { fontSize: 24 },
  docTitle: { fontSize: 14, fontWeight: '700', color: Colors.textDark },
  docLink: { fontSize: 12, color: Colors.primary, marginTop: 2 },
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginBottom: 12, padding: 14,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  checkRowActive: { backgroundColor: '#D1FAE5', borderColor: Colors.success },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    borderColor: Colors.border, backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  checkLabel: { flex: 1, fontSize: 13, color: Colors.textDark, lineHeight: 20 },
  checkLabelBold: { fontWeight: '700', color: Colors.primary },
  lgpdCard: {
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14,
    marginTop: 4, marginBottom: 8,
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
  },
  lgpdIcon: { fontSize: 18 },
  lgpdText: { flex: 1, fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  footer: {
    padding: 16, paddingBottom: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  btn: {
    backgroundColor: Colors.primary, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  btnDisabled: { backgroundColor: Colors.border, shadowOpacity: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
