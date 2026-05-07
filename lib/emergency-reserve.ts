/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Reserva de emergência — fundo separado do ciclo mensal.
 * Suporta depósito externo (não afeta ciclo), depósito do ciclo
 * (gera despesa no mês) e saque para o ciclo (gera receita).
 * Cada usuário tem exatamente 1 row na tabela emergency_reserve.
 */

import { supabase } from './supabase'
import { getCycle } from './cycle'

export type EmergencyReserve = {
  id: string
  user_id: string
  current_amount: number
  target_amount: number | null
  created_at: string
  updated_at: string
}

export type EmergencyTransaction = {
  id: string
  user_id: string
  type: 'deposit_external' | 'deposit_from_cycle' | 'withdrawal_to_cycle'
  amount: number
  description: string | null
  reference_month: string | null
  created_at: string
}

export async function getOrCreateReserve(userId: string): Promise<EmergencyReserve> {
  const { data: existing } = await supabase
    .from('emergency_reserve')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return existing

  const { data: created } = await supabase
    .from('emergency_reserve')
    .insert({ user_id: userId, current_amount: 0 })
    .select()
    .single()

  return created!
}

export async function getReserveTransactions(userId: string): Promise<EmergencyTransaction[]> {
  const { data } = await supabase
    .from('emergency_reserve_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  return data || []
}

export async function depositExternal(
  userId: string,
  amount: number,
  description?: string
): Promise<void> {
  await supabase
    .from('emergency_reserve_transactions')
    .insert({
      user_id: userId,
      type: 'deposit_external',
      amount,
      description: description || 'Depósito externo',
    })

  const reserve = await getOrCreateReserve(userId)
  await supabase
    .from('emergency_reserve')
    .update({
      current_amount: reserve.current_amount + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

export async function depositFromCycle(
  userId: string,
  amount: number,
  cycleStart: number,
  cycleOffset: number,
  description?: string
): Promise<void> {
  const { start } = getCycle(cycleStart, cycleOffset)
  const referenceMonth = start.toISOString().split('T')[0]

  await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: 'expense',
      amount,
      description: description || 'Transferência para Reserva de Emergência',
      date: new Date().toISOString().split('T')[0],
      payment_method: 'transfer',
      pot_id: null,
    })

  await supabase
    .from('emergency_reserve_transactions')
    .insert({
      user_id: userId,
      type: 'deposit_from_cycle',
      amount,
      description: description || 'Transferência do ciclo mensal',
      reference_month: referenceMonth,
    })

  const reserve = await getOrCreateReserve(userId)
  await supabase
    .from('emergency_reserve')
    .update({
      current_amount: reserve.current_amount + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

export async function withdrawToCycle(
  userId: string,
  amount: number,
  cycleStart: number,
  cycleOffset: number,
  description?: string
): Promise<void> {
  const reserve = await getOrCreateReserve(userId)

  if (reserve.current_amount < amount) {
    throw new Error('Saldo insuficiente na reserva de emergência')
  }

  const { start } = getCycle(cycleStart, cycleOffset)
  const referenceMonth = start.toISOString().split('T')[0]
  const dateStr = start > new Date()
    ? start.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: 'income',
      amount,
      description: description || 'Saque da Reserva de Emergência',
      date: dateStr,
      payment_method: 'transfer',
      pot_id: null,
    })

  await supabase
    .from('emergency_reserve_transactions')
    .insert({
      user_id: userId,
      type: 'withdrawal_to_cycle',
      amount,
      description: description || 'Saque para ciclo mensal',
      reference_month: referenceMonth,
    })

  await supabase
    .from('emergency_reserve')
    .update({
      current_amount: reserve.current_amount - amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

export async function updateReserveTarget(
  userId: string,
  targetAmount: number | null
): Promise<void> {
  await supabase
    .from('emergency_reserve')
    .update({
      target_amount: targetAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}
