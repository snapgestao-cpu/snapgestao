import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const CHUNK_SIZE = 1800

const LargeSecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const direct = await SecureStore.getItemAsync(key)
      if (direct) return direct

      const countStr = await SecureStore.getItemAsync(`${key}_count`)
      if (!countStr) return null

      const count = parseInt(countStr)
      let value = ''
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`)
        if (!chunk) return null
        value += chunk
      }
      return value
    } catch {
      return null
    }
  },

  async setItem(key: string, value: string): Promise<void> {
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
      console.error('SecureStore setItem:', err)
    }
  },

  async removeItem(key: string): Promise<void> {
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
      console.error('SecureStore removeItem:', err)
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
