import React, { useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Stack, router, useSegments } from 'expo-router'
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 5 },
  },
})

export default function RootLayout() {
  const { isLoading, isAuthenticated, user, init } = useAuthStore()
  const segments = useSegments()

  useEffect(() => {
    getDatabase()
    const unsubscribe = init()

    // Safety belt: if stored token is invalid (e.g. user deleted from Supabase),
    // getSession returns an error — sign out to clear the stale token.
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        supabase.auth.signOut()
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!user) return

    registerForPushNotifications()
    checkCriticalPots(user.id, user.cycle_start ?? 1)
    scheduleCycleEndReminder()
  }, [user?.id])

  useEffect(() => {
    if (isLoading) return

    const inAuth = segments[0] === '(auth)'
    const inOnboarding = segments[0] === 'onboarding'
    const inTabs = segments[0] === '(tabs)'
    const inPot = segments[0] === 'pot'
    const inOCR = segments[0] === 'ocr'

    if (!isAuthenticated) {
      if (!inAuth) router.replace('/(auth)/login')
      return
    }

    // Autenticado mas sem perfil de usuário = onboarding não concluído
    if (!user || user.initial_balance === 0) {
      if (!inOnboarding) router.replace('/onboarding/step1')
      return
    }

    // Autenticado com perfil completo
    if (!inTabs && !inPot && !inOCR) router.replace('/(tabs)/')
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
        </Stack>
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
