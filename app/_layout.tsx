/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Layout raiz do app — guard de autenticação e onboarding.
 * Redireciona para login, onboarding ou tabs conforme o estado.
 * Safety timeout de 8s desbloqueia o app se o Supabase não responder.
 * Não-autenticado → login; sem perfil → onboarding; perfil OK → tabs.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, router, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { useAuthStore } from '../stores/useAuthStore'
import { getDatabase } from '../lib/database'
import { Colors } from '../constants/colors'
import {
  registerForPushNotifications,
  checkCriticalPots,
  scheduleCycleEndReminder,
} from '../lib/notifications'
import { BadgeToast } from '../components/BadgeToast'
import { checkAndGrantBadgesOnStartup, Badge } from '../lib/badges'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 5 },
  },
})

export default function RootLayout() {
  const { isLoading, isAuthenticated, user, init } = useAuthStore()
  const segments = useSegments()
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])
  const [safetyReady, setSafetyReady] = useState(false)

  useEffect(() => {
    console.log('[Layout] App iniciando...', new Date().toISOString())
    getDatabase()
    const unsubscribe = init()

    const safetyTimeout = setTimeout(() => {
      console.warn('[Layout] SAFETY TIMEOUT 8s — forçando exibição do app.')
      setSafetyReady(true)
    }, 8000)

    return () => {
      unsubscribe()
      clearTimeout(safetyTimeout)
    }
  }, [])

  // Deep link handler — navega para reset-password; a troca de tokens é feita pela própria tela
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      if (!url.includes('reset-password')) return
      console.log('[DeepLink] reset-password detectado')
      router.push('/(auth)/reset-password')
    }

    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url) })
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url))
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!safetyReady) return
    console.log('[Layout] safetyReady=true — app desbloqueado pelo timeout')
  }, [safetyReady])

  // Garantir safetyReady=true após logout (isLoading=false sem timeout de 8s)
  useEffect(() => {
    if (!isLoading && !safetyReady) {
      setSafetyReady(true)
    }
  }, [isLoading])

  useEffect(() => {
    if (!user) return

    registerForPushNotifications()
    checkCriticalPots(user.id, user.cycle_start ?? 1)
    scheduleCycleEndReminder()
    checkAndGrantBadgesOnStartup(user.id, user.cycle_start ?? 1).then(b => { if (b.length > 0) setPendingBadges(b) })
  }, [user?.id])

  useEffect(() => {
    console.log(`[Layout] AuthStore: isLoading=${isLoading} isAuthenticated=${isAuthenticated} user=${user?.id?.substring(0, 8) ?? 'null'}`)
    if (isLoading && !safetyReady) return

    const inAuth = segments[0] === '(auth)'
    const inOnboarding = segments[0] === 'onboarding'
    const inTabs = segments[0] === '(tabs)'
    const inPot = segments[0] === 'pot'
    const inOCR = segments[0] === 'ocr'
    const inAchievements = segments[0] === 'achievements'
    const inMentor = segments[0] === 'mentor'
    const inAnalisador = segments[0] === 'analisador-precos'
    const inTerms = segments[0] === 'terms'
    const inIR = segments[0] === 'ir'
    const inPremium = segments[0] === 'premium'
    if (!isAuthenticated) {
      if (!inAuth) router.replace('/(auth)/login')
      return
    }

    // isAuthenticated=true mas perfil ainda não carregou — aguardar sem redirecionar
    if (!user) return

    // Autenticado com perfil carregado — verificar aceite de termos
    if (!user.terms_accepted_at || user.terms_version !== '1.0') {
      if (!inTerms) router.replace('/terms')
      return
    }

    // Autenticado com termos aceitos — verificar onboarding
    if (!user.onboarding_completed) {
      if (!inOnboarding) router.replace('/onboarding/step1')
      return
    }

    // Autenticado com perfil completo
    if (!inTabs && !inPot && !inOCR && !inAchievements && !inMentor && !inAnalisador && !inIR && !inPremium) router.replace('/(tabs)/monthly')
  }, [isLoading, isAuthenticated, user, segments, safetyReady])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      {(isLoading && !safetyReady) ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (isAuthenticated && !user) ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando perfil...</Text>
        </View>
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="pot/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="ocr" options={{ headerShown: false }} />
          <Stack.Screen name="achievements" options={{ headerShown: false }} />
          <Stack.Screen name="mentor" options={{ headerShown: false }} />
          <Stack.Screen name="analisador-precos" options={{ headerShown: false }} />
          <Stack.Screen name="terms" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="ir" options={{ headerShown: false }} />
        </Stack>
      )}
      {pendingBadges.length > 0 && (
        <BadgeToast badges={pendingBadges} onDone={() => setPendingBadges([])} />
      )}
    </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
  },
})
