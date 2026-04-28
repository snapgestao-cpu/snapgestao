import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
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

  useEffect(() => {
    getDatabase()
    const unsubscribe = init()
    // init() already calls loadSession() which handles invalid/missing tokens
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!user) return

    registerForPushNotifications()
    checkCriticalPots(user.id, user.cycle_start ?? 1)
    scheduleCycleEndReminder()
    checkAndGrantBadgesOnStartup(user.id, user.cycle_start ?? 1).then(b => { if (b.length > 0) setPendingBadges(b) })
  }, [user?.id])

  useEffect(() => {
    if (isLoading) return

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

    // Autenticado mas onboarding não concluído
    if (!user || !user.onboarding_completed) {
      if (!inOnboarding) router.replace('/onboarding/step1')
      return
    }

    // Autenticado com perfil completo
    if (!inTabs && !inPot && !inOCR && !inAchievements && !inMentor && !inAnalisador) router.replace('/(tabs)/')
  }, [isLoading, isAuthenticated, user, segments])

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
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
})
