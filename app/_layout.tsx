import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Stack, router } from 'expo-router'
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
  const [isLoading, setIsLoading] = useState(true)
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([])

  useEffect(() => {
    getDatabase()
  }, [])

  // Verificar sessão na inicialização
  useEffect(() => {
    async function checkAuth() {
      setIsLoading(true)
      try {
        // 1. Verificar sessão atual
        const { data: { session } } = await supabase.auth.getSession()

        // 2. Sem sessão → login
        if (!session) {
          router.replace('/(auth)/login')
          return
        }

        // 3. Com sessão → verificar onboarding
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        // 4. Sem perfil ou onboarding incompleto
        if (!userData || !userData.onboarding_completed) {
          router.replace('/onboarding/step1')
          return
        }

        // 5. Tudo OK → tabs
        setUser(userData)
        router.replace('/(tabs)/')
      } catch {
        router.replace('/(auth)/login')
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  // Listener de mudança de sessão
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // INITIAL_SESSION já tratado por checkAuth acima
        if (event === 'INITIAL_SESSION') return

        if (event === 'SIGNED_OUT' || !session) {
          router.replace('/(auth)/login')
          return
        }

        if (event === 'SIGNED_IN' && session) {
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()

          if (!userData?.onboarding_completed) {
            router.replace('/onboarding/step1')
          } else {
            setUser(userData)
            router.replace('/(tabs)/')
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Notificações e badges após usuário carregado
  useEffect(() => {
    if (!user) return
    registerForPushNotifications()
    checkCriticalPots(user.id, user.cycle_start ?? 1)
    scheduleCycleEndReminder()
    checkAndGrantBadges(user.id, user.cycle_start ?? 1).then(b => { if (b.length > 0) setPendingBadges(b) })
  }, [user?.id])

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
