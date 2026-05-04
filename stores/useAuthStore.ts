import { create } from 'zustand'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { User } from '../types'

type AuthState = {
  session: Session | null
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (name: string, email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  setUser: (user: User | null) => void
  loadSession: () => Promise<void>
  init: () => () => void
}

async function fetchUserProfile(userId: string): Promise<User | null> {
  console.log('[AuthStore] loadUserProfile:', userId.substring(0, 8))
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

    console.log('[AuthStore] Perfil carregado:', JSON.stringify({ onboarding_completed: data?.onboarding_completed, cycle_start: data?.cycle_start }))
    return (data as User) ?? null
  } catch (err) {
    console.error('[AuthStore] ERRO ao carregar perfil:', String(err))
    return null
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
    await supabase.auth.signOut()
    set({ session: null, user: null, isAuthenticated: false })
  },

  setUser: (user) => set({ user }),

  loadSession: async () => {
    console.log('[AuthStore] loadSession iniciando...', new Date().toISOString())
    try {
      const start = Date.now()
      const { data, error } = await supabase.auth.getSession()
      console.log(`[AuthStore] getSession completou em ${Date.now() - start}ms`)

      if (error) {
        console.error('[AuthStore] getSession ERRO:', error.message)
        await supabase.auth.signOut()
        set({ session: null, user: null, isAuthenticated: false, isLoading: false })
        return
      }

      if (!data.session) {
        console.log('[AuthStore] Nenhuma sessão encontrada — ir para login')
        await supabase.auth.signOut()
        set({ session: null, user: null, isAuthenticated: false, isLoading: false })
        return
      }

      console.log('[AuthStore] Sessão encontrada! userId:', data.session.user.id.substring(0, 8))
      console.log('[AuthStore] Token expira em:', new Date(data.session.expires_at! * 1000).toISOString())

      console.log('[AuthStore] Carregando perfil do usuário...')
      const user = await fetchUserProfile(data.session.user.id)
      console.log('[AuthStore] Perfil carregado:', JSON.stringify({ onboarding_completed: user?.onboarding_completed, cycle_start: user?.cycle_start }))

      set({ session: data.session, user, isAuthenticated: true, isLoading: false })
      console.log('[AuthStore] loadSession OK — isAuthenticated: true')
    } catch (err) {
      console.error('[AuthStore] ERRO CRÍTICO no loadSession:', String(err))
      await supabase.auth.signOut()
      set({ session: null, user: null, isAuthenticated: false, isLoading: false })
    }
  },

  init: () => {
    console.log('[AuthStore] init() chamado', new Date().toISOString())
    get().loadSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthStore] onAuthStateChange evento:', event)

        if (event === 'SIGNED_OUT' || !session) {
          console.log('[AuthStore] SIGNED_OUT ou sem sessão')
          set({ session: null, user: null, isAuthenticated: false, isLoading: false })
          return
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          console.log('[AuthStore] SIGNED_IN/TOKEN_REFRESHED — aguardando 500ms antes de query...')
          // Delay para garantir que o cliente Supabase está pronto para queries
          await new Promise(resolve => setTimeout(resolve, 500))

          console.log('[AuthStore] Iniciando loadUserProfile após delay...')
          try {
            const user = await fetchUserProfile(session.user.id)
            set({ session, user, isAuthenticated: true, isLoading: false })
            console.log('[AuthStore] setIsLoading(false) após SIGNED_IN — isAuthenticated: true')
          } catch (err) {
            console.error('[AuthStore] Erro no onAuthStateChange:', String(err))
            await supabase.auth.signOut()
            set({ session: null, user: null, isAuthenticated: false, isLoading: false })
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  },
}))
