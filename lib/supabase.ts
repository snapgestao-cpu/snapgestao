import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const CHUNK_SIZE = 1800

const LargeSecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    console.log(`[SecureStore] getItem: ${key}`)
    try {
      const direct = await SecureStore.getItemAsync(key)
      if (direct) {
        console.log(`[SecureStore] getItem OK direto: ${key} (${direct.length} chars)`)
        return direct
      }

      const countStr = await SecureStore.getItemAsync(`${key}_count`)
      if (!countStr) {
        console.log(`[SecureStore] getItem vazio: ${key}`)
        return null
      }

      const count = parseInt(countStr)
      console.log(`[SecureStore] lendo ${count} chunks para: ${key}`)

      let value = ''
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`)
        if (chunk === null) {
          console.error(`[SecureStore] chunk ${i} FALTANDO para ${key}!`)
          return null
        }
        value += chunk
        console.log(`[SecureStore] chunk ${i} OK (${chunk.length} chars)`)
      }

      console.log(`[SecureStore] getItem completo: ${key} (${value.length} chars total)`)
      return value
    } catch (err) {
      console.error(`[SecureStore] getItem ERRO: ${key}`, String(err))
      return null
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    console.log(`[SecureStore] setItem: ${key} (${value.length} chars)`)
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value)
        await SecureStore.deleteItemAsync(`${key}_count`).catch(() => {})
        console.log(`[SecureStore] setItem OK direto: ${key}`)
        return
      }

      const chunks: string[] = []
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE))
      }

      console.log(`[SecureStore] salvando ${chunks.length} chunks para: ${key}`)

      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i])
        console.log(`[SecureStore] chunk ${i} salvo`)
      }

      await SecureStore.setItemAsync(`${key}_count`, String(chunks.length))
      await SecureStore.deleteItemAsync(key).catch(() => {})
      console.log(`[SecureStore] setItem completo: ${key}`)
    } catch (err) {
      console.error(`[SecureStore] setItem ERRO: ${key}`, String(err))
    }
  },

  async removeItem(key: string): Promise<void> {
    console.log(`[SecureStore] removeItem: ${key}`)
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
      console.log(`[SecureStore] removeItem OK: ${key}`)
    } catch (err) {
      console.error(`[SecureStore] removeItem ERRO: ${key}`, String(err))
    }
  },
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
