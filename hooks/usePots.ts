import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { usePotsStore } from '../stores/usePotsStore'
import { useAuthStore } from '../stores/useAuthStore'
import { Pot } from '../types'

export function usePots() {
  const { user } = useAuthStore()
  const { setPots } = usePotsStore()

  return useQuery({
    queryKey: ['pots', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('pots')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      setPots(data as Pot[])
      return data as Pot[]
    },
    enabled: !!user,
  })
}

export function useCreatePot() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { addPot } = usePotsStore()

  return useMutation({
    mutationFn: async (pot: Omit<Pot, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('pots').insert(pot).select().single()
      if (error) throw error
      return data as Pot
    },
    onSuccess: (pot) => {
      addPot(pot)
      queryClient.invalidateQueries({ queryKey: ['pots', user?.id] })
    },
  })
}

export function useUpdatePot() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { updatePot } = usePotsStore()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pot> }) => {
      const { data, error } = await supabase
        .from('pots')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Pot
    },
    onSuccess: (pot) => {
      updatePot(pot.id, pot)
      queryClient.invalidateQueries({ queryKey: ['pots', user?.id] })
    },
  })
}
