import { supabase } from './supabase'
import { getCycle } from './cycle'

export type ScheduledTransaction = {
  id: string
  user_id: string
  pot_id: string
  description: string
  amount: number
  payment_method: string
  merchant: string | null
  start_date: string
  total_months: number
  created_at: string
}

export type ScheduledTransactionMonth = {
  id: string
  scheduled_transaction_id: string
  user_id: string
  reference_month: string
  status: 'pending' | 'confirmed' | 'cancelled'
  transaction_id: string | null
  confirmed_at: string | null
}

export async function createScheduledTransaction(
  userId: string,
  potId: string,
  data: {
    description: string
    amount: number
    payment_method: string
    merchant?: string
    start_date: string
    total_months: number
  }
): Promise<void> {
  const { data: scheduled, error } = await supabase
    .from('scheduled_transactions')
    .insert({
      user_id: userId,
      pot_id: potId,
      description: data.description,
      amount: data.amount,
      payment_method: data.payment_method,
      merchant: data.merchant || null,
      start_date: data.start_date,
      total_months: data.total_months,
    })
    .select()
    .single()

  if (error) throw error

  const months = []
  const startDate = new Date(data.start_date + 'T12:00:00')

  for (let i = 0; i < data.total_months; i++) {
    const monthDate = new Date(startDate)
    monthDate.setMonth(monthDate.getMonth() + i)
    const referenceMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      1
    ).toISOString().split('T')[0]

    months.push({
      scheduled_transaction_id: scheduled.id,
      user_id: userId,
      reference_month: referenceMonth,
      status: 'pending',
    })
  }

  const { error: monthsError } = await supabase
    .from('scheduled_transaction_months')
    .insert(months)

  if (monthsError) throw monthsError
}

// potId opcional: filtra pelo pote se fornecido
export async function getScheduledForMonth(
  userId: string,
  cycleStart: number,
  cycleOffset: number,
  potId?: string
): Promise<any[]> {
  const { start } = getCycle(cycleStart, cycleOffset)
  const referenceMonth = start.toISOString().split('T')[0]

  const { data } = await supabase
    .from('scheduled_transaction_months')
    .select(`
      *,
      scheduled_transactions (
        id, description, amount,
        payment_method, merchant, pot_id,
        pots ( name, color )
      )
    `)
    .eq('user_id', userId)
    .eq('reference_month', referenceMonth)
    .eq('status', 'pending')

  const rows = data || []
  if (potId) {
    return rows.filter(r => r.scheduled_transactions?.pot_id === potId)
  }
  return rows
}

export async function confirmScheduled(
  monthId: string,
  scheduledId: string,
  userId: string,
  potId: string,
  data: {
    description: string
    amount: number
    payment_method: string
    merchant: string | null
    date: string
  }
): Promise<void> {
  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      pot_id: potId,
      type: 'expense',
      amount: data.amount,
      description: data.description,
      merchant: data.merchant,
      date: data.date,
      payment_method: data.payment_method,
      billing_date: null,
    })
    .select()
    .single()

  if (error) throw error

  const { error: updateError } = await supabase
    .from('scheduled_transaction_months')
    .update({
      status: 'confirmed',
      transaction_id: transaction.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', monthId)

  if (updateError) throw updateError
}

export async function cancelScheduledMonth(monthId: string): Promise<void> {
  const { error } = await supabase
    .from('scheduled_transaction_months')
    .update({ status: 'cancelled' })
    .eq('id', monthId)

  if (error) throw error
}

export async function deleteScheduledTransaction(
  scheduledId: string,
  userId: string
): Promise<void> {
  await supabase
    .from('scheduled_transaction_months')
    .update({ status: 'cancelled' })
    .eq('scheduled_transaction_id', scheduledId)
    .eq('status', 'pending')

  await supabase
    .from('scheduled_transactions')
    .delete()
    .eq('id', scheduledId)
    .eq('user_id', userId)
}
