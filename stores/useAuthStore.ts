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
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  return (data as User) ?? null
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
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) {
        await supabase.auth.signOut()
        set({ session: null, user: null, isAuthenticated: false, isLoading: false })
        return
      }
      const user = await fetchUserProfile(data.session.user.id)
      set({ session: data.session, user, isAuthenticated: true, isLoading: false })
    } catch {
      await supabase.auth.signOut()
      set({ session: null, user: null, isAuthenticated: false, isLoading: false })
    }
  },

  init: () => {
    get().loadSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          set({ session: null, user: null, isAuthenticated: false, isLoading: false })
          return
        }
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          try {
            const user = await fetchUserProfile(session.user.id)
            set({ session, user, isAuthenticated: true, isLoading: false })
          } catch {
            await supabase.auth.signOut()
            set({ session: null, user: null, isAuthenticated: false, isLoading: false })
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  },
}))
