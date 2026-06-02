/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Store de autenticação com Zustand. Gerencia sessão, perfil
 * do usuário e estado de carregamento. init() registra o listener
 * onAuthStateChange antes do getSession para evitar race condition.
 * Safety timeout de 8s garante que o app nunca trava na tela de loading.
 */

import { create } from 'zustand'
import { Session } from '@supabase/supabase-js'
import { supabase, clearSecureStoreCache } from '../lib/supabase'
import { User } from '../types'

type AuthState = {
  session: Session | null
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isPremium: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (name: string, email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  setUser: (user: User | null) => void
  loadSession: () => Promise<void>
  init: () => () => void
}

let isLoadingProfile = false

async function fetchUserProfile(userId: string): Promise<User | null> {
  if (isLoadingProfile) {
    console.log('[AuthStore] loadProfile ignorado — já em andamento')
    return null
  }
  isLoadingProfile = true
  console.log('[AuthStore] fetchUserProfile:', userId.substring(0, 8))

  try {
    const profilePromise = supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    const timeoutPromise = new Promise<null>(resolve =>
      setTimeout(() => {
        console.warn('[AuthStore] TIMEOUT na query de perfil!')
        resolve(null)
      }, 8000)
    )

    const result = await Promise.race([profilePromise, timeoutPromise])
    if (!result) {
      console.warn('[AuthStore] Query de perfil retornou null ou timeout')
      return null
    }

    const { data, error } = result as any
    if (error) {
      console.error('[AuthStore] Erro na query de perfil:', error.message)
      return null
    }

    console.log('[AuthStore] Perfil OK:', JSON.stringify({ onboarding_completed: data?.onboarding_completed, cycle_start: data?.cycle_start }))
    return (data as User) ?? null
  } catch (err) {
    console.error('[AuthStore] ERRO ao carregar perfil:', String(err))
    return null
  } finally {
    isLoadingProfile = false
    console.log('[AuthStore] isLoadingProfile resetado')
  }
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (msg.includes('User already registered')) return 'Este e-mail já está cadastrado.'
  if (msg.includes('Password should be at least')) return 'A senha deve ter no mínimo 6 caracteres.'
  if (msg.includes('Unable to validate email')) return 'Formato de e-mail inválido.'
  if (msg.includes('signup is disabled') || msg.includes('Signups not allowed')) {
    return 'Cadastro temporariamente desabilitado.'
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Muitas tentativas. Aguarde alguns minutos.'
  }
  if (msg.includes('network') || msg.includes('fetch')) return 'Sem conexão. Verifique sua internet.'
  return 'Ocorreu um erro inesperado. Tente novamente.'
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isPremium: false,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return translateError(error.message)
    return null
  },

  signUp: async (name, email, password) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) return translateError(error.message)
    return null
  },

  signOut: async () => {
    clearSecureStoreCache()
    await supabase.auth.signOut()
    set({ session: null, user: null, isAuthenticated: false, isPremium: false })
  },

  setUser: (user) => set({ user, isPremium: user?.plan === 'premium' }),

  // Mantido para compatibilidade — delegado ao init
  loadSession: async () => { },

  init: () => {
    console.log('[AuthStore] init()', new Date().toISOString())

    const loadProfile = (session: Session) => {
      // Sinalizar autenticado imediatamente para o layout poder reagir
      set({ session, isAuthenticated: true })

      fetchUserProfile(session.user.id)
        .then(user => {
          console.log('[AuthStore] Perfil carregado — isLoading=false, user:', user?.id?.substring(0, 8) ?? 'null')
          set({ user, isLoading: false, isPremium: user?.plan === 'premium' })
        })
        .catch(err => {
          console.error('[AuthStore] Erro ao carregar perfil:', String(err))
          set({ isLoading: false })
        })
    }

    // 1. Registrar listener ANTES do getSession para capturar renovação de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthStore] onAuthStateChange:', event)

        if (event === 'TOKEN_REFRESHED' && session) {
          // Token renovado em background — atualizar sessão sem recarregar perfil
          console.log('[AuthStore] Token renovado em background')
          set({ session })
          return
        }

        if (event === 'SIGNED_OUT' || !session) {
          console.log('[AuthStore] SIGNED_OUT')
          clearSecureStoreCache()
          isLoadingProfile = false
          set({ session: null, user: null, isAuthenticated: false, isLoading: false })
          return
        }

        if (event === 'SIGNED_IN') {
          // Cobre o caso em que getSession demorou mais de 3s e chegou via listener
          console.log('[AuthStore] SIGNED_IN via onAuthStateChange')
          loadProfile(session)
          return
        }
      }
    )

    // 2. getSession com timeout de 3s — se demorar, onAuthStateChange cuida
    const sessionPromise = supabase.auth.getSession().then(r => ({ ...r, timedOut: false as const }))
    const timeoutPromise = new Promise<{ data: { session: null }, timedOut: true }>(
      resolve => setTimeout(() => {
        console.warn('[AuthStore] getSession > 3s — aguardando onAuthStateChange...')
        resolve({ data: { session: null }, timedOut: true })
      }, 3000)
    )

    Promise.race([sessionPromise, timeoutPromise])
      .then(result => {
        if (result.timedOut) {
          // getSession ainda rodando; onAuthStateChange vai completar o fluxo.
          // Safety: se nada acontecer em mais 8s, forçar isLoading=false para login.
          setTimeout(() => {
            if (get().isLoading) {
              console.warn('[AuthStore] Safety 8s — forçando isLoading=false')
              set({ isLoading: false })
            }
          }, 8000)
          return
        }

        const { data, error } = result
        if (error) {
          console.error('[AuthStore] getSession ERRO:', error.message)
          set({ session: null, user: null, isAuthenticated: false, isLoading: false })
          return
        }

        if (!data.session) {
          console.log('[AuthStore] Sem sessão — ir para login')
          set({ session: null, user: null, isAuthenticated: false, isLoading: false })
          return
        }

        console.log('[AuthStore] getSession OK em <3s — userId:', data.session.user.id.substring(0, 8))
        loadProfile(data.session)
      })
      .catch(err => {
        console.error('[AuthStore] ERRO CRÍTICO no init:', String(err))
        set({ session: null, user: null, isAuthenticated: false, isLoading: false })
      })

    return () => subscription.unsubscribe()
  },
}))
