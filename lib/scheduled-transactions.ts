/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 02/06/2026
 *
 * Lançamentos a confirmar — transações recorrentes agendadas
 * dentro de um pote. O usuário confirma mês a mês para gerar
 * o lançamento real. Status: pending → confirmed | cancelled.
 * Badge no tab Potes indica quantos estão pendentes no mês atual.
 */

import { supabase } from './supabase'
import { getCycle } from './cycle'
import { calcBillingDate, calcBillingDateNoCard } from './billing-date'
import type { CreditCard, IRCategory } from '../types'

export type ScheduledTransaction = {
  id: string
  user_id: string
  pot_id: string
  description: string
  amount: number
  payment_method: string
  credit_card_id: string | null
  merchant: string | null
  start_date: string
  total_months: number
  created_at: string
  is_ir_deductible: boolean | null
  ir_category: IRCategory | null
  ir_provider_name: string | null
  ir_provider_document: string | null
  ir_receipt_number: string | null
}

export type ScheduledTransactionMonth = {
  id: string
  scheduled_transaction_id: string
  user_id: string
  reference_month: string
  status: 'pending' | 'confirmed' | 'cancelled'
  transaction_id: string | null
  confirmed_at: string | null
  // overrides por mês (null = herda do pai)
  description: string | null
  amount: number | null
  merchant: string | null
  date: string | null
  payment_method: string | null
  credit_card_id: string | null
}

export async function createScheduledTransaction(
  userId: string,
  potId: string,
  data: {
    description: string
    amount: number
    payment_method: string
    credit_card_id?: string | null
    merchant?: string
    start_date: string
    total_months: number
    is_ir_deductible?: boolean
    ir_category?: IRCategory | null
    ir_provider_name?: string | null
    ir_provider_document?: string | null
    ir_receipt_number?: string | null
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
      credit_card_id: data.credit_card_id ?? null,
      merchant: data.merchant || null,
      start_date: data.start_date,
      total_months: data.total_months,
      is_ir_deductible: data.is_ir_deductible ?? false,
      ir_category: data.is_ir_deductible ? (data.ir_category ?? null) : null,
      ir_provider_name: data.is_ir_deductible ? (data.ir_provider_name ?? null) : null,
      ir_provider_document: data.is_ir_deductible ? (data.ir_provider_document ?? null) : null,
      ir_receipt_number: data.is_ir_deductible ? (data.ir_receipt_number ?? null) : null,
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

// Mantém o dia de start_date no mês de referência (com clamp no último dia do mês)
function getVencimentoForMonth(startDate: string, referenceMonth: string): string {
  const startDay = parseInt(startDate.split('-')[2], 10)
  const [refYear, refMonth] = referenceMonth.split('-')
  const lastDayOfMonth = new Date(parseInt(refYear, 10), parseInt(refMonth, 10), 0).getDate()
  const day = Math.min(startDay, lastDayOfMonth)
  return `${refYear}-${refMonth}-${String(day).padStart(2, '0')}`
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
        payment_method, credit_card_id,
        merchant, pot_id,
        start_date,
        is_ir_deductible, ir_category, ir_provider_name, ir_provider_document, ir_receipt_number,
        pots ( name, color )
      )
    `)
    .eq('user_id', userId)
    .eq('reference_month', referenceMonth)
    .eq('status', 'pending')

  const rows = (data || []).map(item => {
    const startDate = item.scheduled_transactions?.start_date
    const vencimento = startDate
      ? getVencimentoForMonth(startDate, item.reference_month)
      : null
    return { ...item, vencimento }
  })

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
    credit_card_id?: string | null
    merchant: string | null
    date: string
    is_ir_deductible?: boolean | null
    ir_category?: IRCategory | null
    ir_provider_name?: string | null
    ir_provider_document?: string | null
    ir_receipt_number?: string | null
  }
): Promise<void> {
  let billingDate: string | null = null

  if (data.payment_method === 'credit') {
    if (data.credit_card_id) {
      const { data: card } = await supabase
        .from('credit_cards')
        .select('*')
        .eq('id', data.credit_card_id)
        .single()
      billingDate = card
        ? calcBillingDate(data.date, card as CreditCard, 0)
        : calcBillingDateNoCard(data.date, 0)
    } else {
      billingDate = calcBillingDateNoCard(data.date, 0)
    }
  }

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
      card_id: data.credit_card_id ?? null,
      billing_date: billingDate,
      is_ir_deductible: data.is_ir_deductible ?? false,
      ir_category: data.is_ir_deductible ? (data.ir_category ?? null) : null,
      ir_provider_name: data.is_ir_deductible ? (data.ir_provider_name ?? null) : null,
      ir_provider_document: data.is_ir_deductible ? (data.ir_provider_document ?? null) : null,
      ir_receipt_number: data.is_ir_deductible ? (data.ir_receipt_number ?? null) : null,
      ir_receipt_image_path: null,
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

// Cancela este mês e todos os próximos pendentes da mesma série
export async function cancelScheduledFromMonth(
  scheduledId: string,
  referenceMonth: string
): Promise<void> {
  const { error } = await supabase
    .from('scheduled_transaction_months')
    .update({ status: 'cancelled' })
    .eq('scheduled_transaction_id', scheduledId)
    .gte('reference_month', referenceMonth)
    .eq('status', 'pending')

  if (error) throw error
}

// Edita apenas este mês: overrides não-IR ficam no mês; campos IR sempre vão ao pai
export async function updateScheduledMonthOnly(
  monthId: string,
  scheduledId: string,
  data: {
    // overrides por mês
    description?: string | null
    amount?: number | null
    payment_method?: string | null
    credit_card_id?: string | null
    merchant?: string | null
    date?: string | null
    // campos IR — salvos no pai, valem para todos os meses
    is_ir_deductible?: boolean
    ir_category?: IRCategory | null
    ir_provider_name?: string | null
    ir_provider_document?: string | null
    ir_receipt_number?: string | null
  }
): Promise<void> {
  const { is_ir_deductible, ir_category, ir_provider_name, ir_provider_document, ir_receipt_number, ...monthData } = data

  const { error: monthError } = await supabase
    .from('scheduled_transaction_months')
    .update(monthData)
    .eq('id', monthId)
  if (monthError) throw monthError

  // Salva IR no pai (se veio algum campo IR)
  if (is_ir_deductible !== undefined) {
    const { error: irError } = await supabase
      .from('scheduled_transactions')
      .update({
        is_ir_deductible,
        ir_category: is_ir_deductible ? (ir_category ?? null) : null,
        ir_provider_name: is_ir_deductible ? (ir_provider_name ?? null) : null,
        ir_provider_document: is_ir_deductible ? (ir_provider_document ?? null) : null,
        ir_receipt_number: is_ir_deductible ? (ir_receipt_number ?? null) : null,
      })
      .eq('id', scheduledId)
    if (irError) throw irError
  }
}

// Edita este mês e os próximos: atualiza o pai e limpa overrides dos meses pendentes
export async function updateScheduledFromMonth(
  scheduledId: string,
  referenceMonth: string,
  data: {
    description: string
    amount: number
    payment_method: string
    credit_card_id?: string | null
    merchant?: string | null
    is_ir_deductible?: boolean
    ir_category?: IRCategory | null
    ir_provider_name?: string | null
    ir_provider_document?: string | null
    ir_receipt_number?: string | null
  }
): Promise<void> {
  const { error: parentError } = await supabase
    .from('scheduled_transactions')
    .update({
      description: data.description,
      amount: data.amount,
      payment_method: data.payment_method,
      credit_card_id: data.credit_card_id ?? null,
      merchant: data.merchant ?? null,
      is_ir_deductible: data.is_ir_deductible ?? false,
      ir_category: data.is_ir_deductible ? (data.ir_category ?? null) : null,
      ir_provider_name: data.is_ir_deductible ? (data.ir_provider_name ?? null) : null,
      ir_provider_document: data.is_ir_deductible ? (data.ir_provider_document ?? null) : null,
      ir_receipt_number: data.is_ir_deductible ? (data.ir_receipt_number ?? null) : null,
    })
    .eq('id', scheduledId)

  if (parentError) throw parentError

  // Limpa overrides de meses pendentes a partir deste mês
  const { error: monthsError } = await supabase
    .from('scheduled_transaction_months')
    .update({
      description: null,
      amount: null,
      payment_method: null,
      credit_card_id: null,
      merchant: null,
      date: null,
    })
    .eq('scheduled_transaction_id', scheduledId)
    .gte('reference_month', referenceMonth)
    .eq('status', 'pending')

  if (monthsError) throw monthsError
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
