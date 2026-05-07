/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Movimentações de metas financeiras — depósito externo,
 * depósito do ciclo (gera despesa no mês), saque para o ciclo
 * (gera receita) e conclusão de meta. Histórico completo
 * armazenado em goal_transactions com tipo e referência de mês.
 */

import { supabase } from './supabase'
import { getCycle } from './cycle'

export type GoalTransaction = {
  id: string
  goal_id: string
  user_id: string
  type: 'deposit_external' | 'deposit_from_cycle' | 'withdrawal_to_cycle'
  amount: number
  description: string | null
  reference_month: string | null
  created_at: string
}

export async function depositExternalToGoal(
  goalId: string,
  userId: string,
  amount: number,
  description?: string
): Promise<void> {
  await supabase
    .from('goal_transactions')
    .insert({
      goal_id: goalId,
      user_id: userId,
      type: 'deposit_external',
      amount,
      description: description || 'Depósito externo',
    })

  const { data: goal } = await supabase
    .from('goals')
    .select('current_amount')
    .eq('id', goalId)
    .single()

  await supabase
    .from('goals')
    .update({ current_amount: Number(goal?.current_amount || 0) + amount })
    .eq('id', goalId)
    .eq('user_id', userId)
}

export async function depositFromCycleToGoal(
  goalId: string,
  userId: string,
  amount: number,
  cycleStart: number,
  cycleOffset: number,
  goalName: string,
  description?: string
): Promise<void> {
  const { start } = getCycle(cycleStart, cycleOffset)
  const referenceMonth = start.toISOString().split('T')[0]
  const dateStr = new Date().toISOString().split('T')[0]

  await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: 'expense',
      amount,
      description: description || `Depósito na meta: ${goalName}`,
      date: dateStr,
      payment_method: 'transfer',
      pot_id: null,
    })

  await supabase
    .from('goal_transactions')
    .insert({
      goal_id: goalId,
      user_id: userId,
      type: 'deposit_from_cycle',
      amount,
      description: description || 'Do ciclo mensal',
      reference_month: referenceMonth,
    })

  const { data: goal } = await supabase
    .from('goals')
    .select('current_amount')
    .eq('id', goalId)
    .single()

  await supabase
    .from('goals')
    .update({ current_amount: Number(goal?.current_amount || 0) + amount })
    .eq('id', goalId)
    .eq('user_id', userId)
}

export async function withdrawFromGoalToCycle(
  goalId: string,
  userId: string,
  amount: number,
  cycleStart: number,
  cycleOffset: number,
  goalName: string,
  description?: string
): Promise<void> {
  const { data: goal } = await supabase
    .from('goals')
    .select('current_amount')
    .eq('id', goalId)
    .single()

  if (Number(goal?.current_amount || 0) < amount) {
    throw new Error('Saldo insuficiente na meta')
  }

  const { start } = getCycle(cycleStart, cycleOffset)
  const referenceMonth = start.toISOString().split('T')[0]
  const today = new Date()
  const dateStr = start > today ? referenceMonth : today.toISOString().split('T')[0]

  await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: 'income',
      amount,
      description: description || `Saque da meta: ${goalName}`,
      date: dateStr,
      payment_method: 'transfer',
      pot_id: null,
    })

  await supabase
    .from('goal_transactions')
    .insert({
      goal_id: goalId,
      user_id: userId,
      type: 'withdrawal_to_cycle',
      amount,
      description: description || 'Saque para o mês',
      reference_month: referenceMonth,
    })

  await supabase
    .from('goals')
    .update({ current_amount: Number(goal!.current_amount) - amount })
    .eq('id', goalId)
    .eq('user_id', userId)
}

export async function completeGoal(
  goalId: string,
  userId: string
): Promise<void> {
  await supabase
    .from('goals')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completion_type: 'manual',
    })
    .eq('id', goalId)
    .eq('user_id', userId)
}

export async function getGoalTransactions(goalId: string): Promise<GoalTransaction[]> {
  const { data } = await supabase
    .from('goal_transactions')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false })

  return data || []
}

export async function getCompletedGoals(userId: string): Promise<any[]> {
  const { data } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'active')
    .order('completed_at', { ascending: false })

  return data || []
}
