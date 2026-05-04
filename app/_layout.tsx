import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { Stack, router, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
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

  useEffect(() => {
    if (!safetyReady) return
    console.log('[Layout] safetyReady=true — app desbloqueado pelo timeout')
  }, [safetyReady])

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

    if (!isAuthenticated) {
      if (!inAuth) router.replace('/(auth)/login')
      return
    }

    // isAuthenticated=true mas perfil ainda não carregou — aguardar sem redirecionar
    if (!user) return

    // Autenticado com perfil carregado — verificar onboarding
    if (!user.onboarding_completed) {
      if (!inOnboarding) router.replace('/onboarding/step1')
      return
    }

    // Autenticado com perfil completo
    if (!inTabs && !inPot && !inOCR && !inAchievements && !inMentor && !inAnalisador) router.replace('/(tabs)/monthly')
  }, [isLoading, isAuthenticated, user, segments, safetyReady])

  return (
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
        </Stack>
      )}
      {pendingBadges.length > 0 && (
        <BadgeToast badges={pendingBadges} onDone={() => setPendingBadges([])} />
      )}
    </QueryClientProvider>
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
