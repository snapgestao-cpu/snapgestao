import { supabase } from './supabase'
import { calcBillingDate } from './billing-date'
import type { CycleOverridesMap } from './billing-date'
import type { CreditCard } from '../types'

// Overrides pontuais de fechamento/vencimento por ciclo (exceção do mês, sem
// virar padrão do cartão). Retorna um mapa keyed por cycle_start ISO (primeiro
// dia do mês, YYYY-MM-01). Tabela pequena — uma query só, sem paginação.
export async function getCardOverridesMap(cardId: string): Promise<CycleOverridesMap> {
  const { data } = await supabase
    .from('credit_card_cycle_overrides')
    .select('cycle_start, closing_day, due_day')
    .eq('card_id', cardId)

  const map: CycleOverridesMap = {}
  for (const row of (data ?? []) as any[]) {
    // Normaliza a chave para o 1º dia do mês (YYYY-MM-01), igual ao lookup em calcBillingDate.
    const key = String(row.cycle_start).slice(0, 7) + '-01'
    map[key] = {
      closing_day: row.closing_day != null ? Number(row.closing_day) : null,
      due_day: row.due_day != null ? Number(row.due_day) : null,
    }
  }
  return map
}

// Recalcula (UPDATE, sem delete+insert) o billing_date SOMENTE das parcelas do
// cartão cujo billing_date cai dentro do mês afetado pelo override, aplicando os
// overrides. NÃO altera closing_day/due_day do cartão — é uma exceção pontual.
// Mesmo padrão de recalculateFutureInstallments, mas escopado a um mês.
export async function recalculateInstallmentsForCycle(
  cardId: string,
  card: CreditCard,
  monthStartISO: string,
  monthEndISO: string,
  overrides: CycleOverridesMap,
): Promise<number> {
  const { data } = await supabase
    .from('transactions')
    .select('id, date, installment_number')
    .eq('card_id', cardId)
    .eq('payment_method', 'credit')
    .gte('billing_date', monthStartISO)
    .lte('billing_date', monthEndISO)

  if (!data || data.length === 0) return 0

  await Promise.all(
    data.map(tx => {
      const offset = tx.installment_number != null ? (tx.installment_number as number) - 1 : 0
      const newBillingDate = calcBillingDate(tx.date as string, card, offset, overrides)
      return supabase.from('transactions').update({ billing_date: newBillingDate }).eq('id', tx.id)
    })
  )

  return data.length
}

export async function hasAnyCreditCard(userId: string): Promise<boolean> {
  const { count } = await supabase
    .from('credit_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return (count ?? 0) > 0
}

export async function getFutureInstallments(
  userId: string,
  cardId: string,
  currentCycleEnd: string
): Promise<{ count: number; total: number }> {
  const { data } = await supabase
    .from('transactions')
    .select('id, amount')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .eq('payment_method', 'credit')
    .gt('billing_date', currentCycleEnd)
  return {
    count: data?.length ?? 0,
    total: data?.reduce((sum, t) => sum + (t.amount as number), 0) ?? 0,
  }
}

export async function deleteFutureInstallments(
  cardId: string,
  currentCycleEnd: string
): Promise<void> {
  await supabase
    .from('transactions')
    .delete()
    .eq('card_id', cardId)
    .eq('payment_method', 'credit')
    .gt('billing_date', currentCycleEnd)
}

export async function analyzeRecalculation(
  cardId: string,
  updatedCard: CreditCard,
  currentCycleEnd: string
): Promise<{ total: number; movingToCurrent: number }> {
  const { data } = await supabase
    .from('transactions')
    .select('id, date, installment_number')
    .eq('card_id', cardId)
    .eq('payment_method', 'credit')
    .gt('billing_date', currentCycleEnd)

  if (!data || data.length === 0) return { total: 0, movingToCurrent: 0 }

  let movingToCurrent = 0
  for (const tx of data) {
    const offset = tx.installment_number != null ? (tx.installment_number as number) - 1 : 0
    const newDate = calcBillingDate(tx.date as string, updatedCard, offset)
    if (newDate <= currentCycleEnd) movingToCurrent++
  }

  return { total: data.length, movingToCurrent }
}

export async function recalculateFutureInstallments(
  cardId: string,
  updatedCard: CreditCard,
  currentCycleEnd: string
): Promise<number> {
  const { data } = await supabase
    .from('transactions')
    .select('id, date, installment_number')
    .eq('card_id', cardId)
    .eq('payment_method', 'credit')
    .gt('billing_date', currentCycleEnd)

  if (!data || data.length === 0) return 0

  await Promise.all(
    data.map(tx => {
      const offset = tx.installment_number != null ? (tx.installment_number as number) - 1 : 0
      const newBillingDate = calcBillingDate(tx.date as string, updatedCard, offset)
      return supabase.from('transactions').update({ billing_date: newBillingDate }).eq('id', tx.id)
    })
  )

  return data.length
}

export async function deleteCardWithCascade(
  userId: string,
  cardId: string,
  currentCycleEnd: string
): Promise<void> {
  await deleteFutureInstallments(cardId, currentCycleEnd)
  await supabase.from('transactions').update({ card_id: null }).eq('card_id', cardId)
  const { error } = await supabase.from('credit_cards').delete().eq('id', cardId).eq('user_id', userId)
  if (error) throw new Error(error.message)
}
