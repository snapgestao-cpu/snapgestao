import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const CHUNK_SIZE = 1800

// Cache em memória para evitar leituras repetidas do SecureStore
const memoryCache: Record<string, string> = {}
// Deduplicação: se já há uma leitura em andamento para a mesma chave, reutiliza a Promise
const pendingReads: Record<string, Promise<string | null>> = {}

const LargeSecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    // 1. Cache em memória — evita qualquer I/O
    if (memoryCache[key] !== undefined) {
      console.debug(`[SecureStore] cache hit: ${key}`)
      return memoryCache[key] || null
    }

    // 2. Leitura já em andamento — reutiliza sem abrir novo acesso ao SecureStore
    if (key in pendingReads) {
      console.debug(`[SecureStore] aguardando leitura pendente: ${key}`)
      return pendingReads[key]
    }

    // 3. Nova leitura
    pendingReads[key] = (async () => {
      try {
        console.debug(`[SecureStore] lendo: ${key}`)

        const direct = await SecureStore.getItemAsync(key)
        if (direct) {
          memoryCache[key] = direct
          return direct
        }

        const countStr = await SecureStore.getItemAsync(`${key}_count`)
        if (!countStr) {
          memoryCache[key] = ''
          return null
        }

        const count = parseInt(countStr)
        let value = ''
        for (let i = 0; i < count; i++) {
          const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`)
          if (chunk === null) {
            console.error(`[SecureStore] chunk ${i} FALTANDO para ${key}!`)
            return null
          }
          value += chunk
        }

        memoryCache[key] = value
        console.debug(`[SecureStore] leitura OK: ${key} (${value.length} chars)`)
        return value
      } catch (err) {
        console.error(`[SecureStore] getItem ERRO: ${key}`, String(err))
        return null
      } finally {
        delete pendingReads[key]
      }
    })()

    return pendingReads[key]
  },

  async setItem(key: string, value: string): Promise<void> {
    // Atualizar cache imediatamente antes do I/O
    memoryCache[key] = value
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value)
        await SecureStore.deleteItemAsync(`${key}_count`).catch(() => {})
        return
      }

      const chunks: string[] = []
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE))
      }

      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i])
      }

      await SecureStore.setItemAsync(`${key}_count`, String(chunks.length))
      await SecureStore.deleteItemAsync(key).catch(() => {})
    } catch (err) {
      delete memoryCache[key]
      console.error(`[SecureStore] setItem ERRO: ${key}`, String(err))
    }
  },

  async removeItem(key: string): Promise<void> {
    delete memoryCache[key]
    try {
      await SecureStore.deleteItemAsync(key).catch(() => {})

      const countStr = await SecureStore.getItemAsync(`${key}_count`).catch(() => null)
      if (countStr) {
        const count = parseInt(countStr)
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`).catch(() => {})
        }
        await SecureStore.deleteItemAsync(`${key}_count`).catch(() => {})
      }
    } catch (err) {
      console.error(`[SecureStore] removeItem ERRO: ${key}`, String(err))
    }
  },
}

export function clearSecureStoreCache() {
  Object.keys(memoryCache).forEach(key => {
    delete memoryCache[key]
  })
  console.log('[SecureStore] Cache limpo')
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: LargeSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
