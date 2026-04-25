import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Stack, router, useSegments, useRootNavigationState } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import { getDatabase } from '../lib/database'
import { Colors } from '../constants/colors'
import {
  registerForPushNotifications,
  checkCriticalPots,
  scheduleCycleEndReminder,
} from '../lib/notifications'
import { BadgeToast } from '../components/BadgeToast'
import { checkAndGrantBadges, Badge } from '../lib/badges'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 5 },
  },
})

export default function RootLayout() {
  const { user, setUser } = useAuthStore()
  const [isReady, setIsReady] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])

  const segments = useSegments()
  const navigationState = useRootNavigationState()

  // 1. Carregar sessão inicial + listener
  useEffect(() => {
    getDatabase()

    async function init() {
      try {
        const { data: { session: s } } = await supabase.auth.getSession()
        setSession(s)

        if (s?.user) {
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', s.user.id)
            .maybeSingle()

          const done = userData?.onboarding_completed === true
          setOnboardingDone(done)
          if (done && userData) setUser(userData)
        }
      } catch (err) {
        console.error('Erro no init:', err)
      } finally {
        setIsReady(true)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        setSession(s)

        if (s?.user) {
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', s.user.id)
            .maybeSingle()

          const done = userData?.onboarding_completed === true
          setOnboardingDone(done)
          if (done && userData) setUser(userData)
        } else {
          setOnboardingDone(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // 2. Navegar quando pronto E navigator montado
  useEffect(() => {
    if (!navigationState?.key) return
    if (!isReady) return

    const inAuthGroup = segments[0] === '(auth)'
    const inOnboarding = segments[0] === 'onboarding'
    const inTabs = segments[0] === '(tabs)'
    const inAllowed = inTabs
      || segments[0] === 'pot'
      || segments[0] === 'ocr'
      || segments[0] === 'achievements'
      || segments[0] === 'mentor'
      || segments[0] === 'analisador-precos'

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login')
      return
    }

    if (!onboardingDone) {
      if (!inOnboarding) router.replace('/onboarding/step1')
      return
    }

    if (!inAllowed) router.replace('/(tabs)/')
  }, [isReady, session, onboardingDone, navigationState?.key, segments])

  // 3. Notificações e badges
  useEffect(() => {
    if (!user) return
    registerForPushNotifications()
    checkCriticalPots(user.id, user.cycle_start ?? 1)
    scheduleCycleEndReminder()
    checkAndGrantBadges(user.id, user.cycle_start ?? 1).then(b => { if (b.length > 0) setPendingBadges(b) })
  }, [user?.id])

  // 4. Spinner enquanto carrega
  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    )
  }

  // 5. Stack com providers
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
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
      {pendingBadges.length > 0 && (
        <BadgeToast badges={pendingBadges} onDone={() => setPendingBadges([])} />
      )}
    </QueryClientProvider>
  )
}
