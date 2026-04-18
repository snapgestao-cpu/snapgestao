import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { IncomeSource } from '../types'

export function useIncomeSources() {
  const { user } = useAuthStore()

  return useQuery({
    queryKey: ['income_sources', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('income_sources')
        .select('*')
        .eq('user_id', user.id)
      if (error) throw error
      return data as IncomeSource[]
    },
    enabled: !!user,
  })
}
