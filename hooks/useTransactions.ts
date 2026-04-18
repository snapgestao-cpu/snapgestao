import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useTransactionStore } from '../stores/useTransactionStore'
import { useAuthStore } from '../stores/useAuthStore'
import { Transaction } from '../types'

export function useTransactions(potId?: string) {
  const { user } = useAuthStore()
  const { setTransactions } = useTransactionStore()

  return useQuery({
    queryKey: ['transactions', user?.id, potId],
    queryFn: async () => {
      if (!user) return []
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
      if (potId) query = query.eq('pot_id', potId)
      const { data, error } = await query
      if (error) throw error
      setTransactions(data as Transaction[])
      return data as Transaction[]
    },
    enabled: !!user,
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { addTransaction } = useTransactionStore()

  return useMutation({
    mutationFn: async (tx: Omit<Transaction, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('transactions')
        .insert(tx)
        .select()
        .single()
      if (error) throw error
      return data as Transaction
    },
    onSuccess: (tx) => {
      addTransaction(tx)
      queryClient.invalidateQueries({ queryKey: ['transactions', user?.id] })
    },
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { removeTransaction } = useTransactionStore()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      removeTransaction(id)
      queryClient.invalidateQueries({ queryKey: ['transactions', user?.id] })
    },
  })
}
