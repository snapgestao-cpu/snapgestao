import { supabase } from './supabase'
import { getCycle } from './cycle'

export type Debt = {
  id: string
  user_id: string
  name: string
  total_amount: number
  paid_amount: number
  monthly_payment: number | null
  target_date: string | null
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
}

export type DebtTransaction = {
  id: string
  debt_id: string
  user_id: string
  type: 'payment_external' | 'payment_from_cycle'
  amount: number
  description: string | null
  cycle_year: number | null
  cycle_month: number | null
  created_at: string
}

export async function getDebts(userId: string): Promise<Debt[]> {
  const { data } = await supabase
    .from('debts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('target_date', { ascending: true, nullsFirst: false })
  return (data ?? []) as Debt[]
}

export async function getCompletedDebts(userId: string): Promise<Debt[]> {
  const { data } = await supabase
    .from('debts')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'active')
    .order('updated_at', { ascending: false })
  return (data ?? []) as Debt[]
}

export async function createDebt(
  userId: string,
  data: {
    name: string
    total_amount: number
    paid_amount?: number
    monthly_payment?: number | null
    target_date?: string | null
  }
): Promise<Debt> {
  const { data: result, error } = await supabase
    .from('debts')
    .insert({
      user_id: userId,
      name: data.name,
      total_amount: data.total_amount,
      paid_amount: data.paid_amount ?? 0,
      monthly_payment: data.monthly_payment ?? null,
      target_date: data.target_date ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result as Debt
}

export async function updateDebt(
  debtId: string,
  userId: string,
  data: {
    name?: string
    total_amount?: number
    monthly_payment?: number | null
    target_date?: string | null
  }
): Promise<void> {
  await supabase
    .from('debts')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', debtId)
    .eq('user_id', userId)
}

export async function deleteDebt(debtId: string, userId: string): Promise<void> {
  await supabase.from('debts').delete().eq('id', debtId).eq('user_id', userId)
}

export async function completeDebt(debtId: string, userId: string): Promise<void> {
  await supabase
    .from('debts')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', debtId)
    .eq('user_id', userId)
}

export async function payDebtExternal(
  debtId: string,
  userId: string,
  amount: number,
  description?: string
): Promise<number> {
  const { data: debt, error: fetchError } = await supabase
    .from('debts').select('paid_amount, total_amount').eq('id', debtId).single()
  if (fetchError) throw new Error(fetchError.message)

  const newPaid = Number(debt.paid_amount) + amount

  const { error: txError } = await supabase.from('debt_transactions').insert({
    debt_id: debtId,
    user_id: userId,
    type: 'payment_external',
    amount,
    description: description || null,
  })
  if (txError) throw new Error(txError.message)

  await supabase
    .from('debts')
    .update({ paid_amount: newPaid, updated_at: new Date().toISOString() })
    .eq('id', debtId)

  return newPaid
}

export async function payDebtFromCycle(
  debtId: string,
  userId: string,
  amount: number,
  cycleStartDay: number,
  cycleOffset: number,
  debtName: string,
  description?: string
): Promise<number> {
  const { data: debt, error: fetchError } = await supabase
    .from('debts').select('paid_amount, total_amount').eq('id', debtId).single()
  if (fetchError) throw new Error(fetchError.message)

  const newPaid = Number(debt.paid_amount) + amount

  const { start } = getCycle(cycleStartDay, cycleOffset)
  const hoje = new Date()
  const dateStr = start <= hoje
    ? hoje.toISOString().split('T')[0]
    : start.toISOString().split('T')[0]

  const { error: txError } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'expense',
    amount,
    description: `Pagamento: ${debtName}`,
    date: dateStr,
    payment_method: 'transfer',
    pot_id: null,
  })
  if (txError) throw new Error(txError.message)

  await supabase.from('debt_transactions').insert({
    debt_id: debtId,
    user_id: userId,
    type: 'payment_from_cycle',
    amount,
    description: description || null,
    cycle_year: start.getFullYear(),
    cycle_month: start.getMonth() + 1,
  })

  await supabase
    .from('debts')
    .update({ paid_amount: newPaid, updated_at: new Date().toISOString() })
    .eq('id', debtId)

  return newPaid
}

export async function getDebtTransactions(debtId: string): Promise<DebtTransaction[]> {
  const { data } = await supabase
    .from('debt_transactions')
    .select('*')
    .eq('debt_id', debtId)
    .order('created_at', { ascending: false })
  return (data ?? []) as DebtTransaction[]
}

export function calcDebtMonthsRemaining(debt: Debt): number | null {
  if (!debt.monthly_payment || debt.monthly_payment <= 0) return null
  const remaining = debt.total_amount - debt.paid_amount
  if (remaining <= 0) return 0
  return Math.ceil(remaining / debt.monthly_payment)
}
