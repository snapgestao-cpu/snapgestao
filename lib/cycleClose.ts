import { supabase } from './supabase'
import { getCycle, CycleInfo } from './cycle'
import { fetchPotsForCycleWithHistory } from './pot-history'
import { Pot } from '../types'

export type PotSummary = {
  id: string
  name: string
  color: string
  limit_amount: number | null
  spent: number
  remaining: number
  isOverBudget: boolean
}

export type CycleSummary = {
  monthlyIncome: number
  totalIncome: number
  totalExpense: number
  debtFromPrev: number
  surplusFromPrev: number
  availableIncome: number
  cycleSaldo: number
  totalDebt: number
  totalSurplus: number
  potSummaries: PotSummary[]
  isOverBudget: boolean
  needsAlert: boolean
}

// Compute CycleSummary from already-fetched data (zero queries).
// Use in monthly.tsx to avoid duplicating the 5 queries inside calculateCycleSummary.
export function computeCycleSummaryFromData(
  pots: Pot[],
  sources: { amount: number }[],
  incomingRollover: any | null,
  nonCreditTxs: { amount: number; type: string; pot_id: string | null }[],
  creditTxs: { amount: number; type: string; pot_id: string | null }[],
): CycleSummary {
  const monthlyIncome = sources.reduce((s, r) => s + Number(r.amount), 0)
  const totalIncome = nonCreditTxs
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0)

  const allExpenses = [
    ...creditTxs.filter(t => t.type !== 'income'),
    ...nonCreditTxs.filter(t => t.type === 'expense' || t.type === 'goal_deposit'),
  ]
  const totalExpense = allExpenses.reduce((s, t) => s + Number(t.amount), 0)

  const debtFromPrev = Number(incomingRollover?.total_debt ?? 0)
  const surplusFromPrev = Number(incomingRollover?.total_surplus ?? 0)
  const availableIncome = monthlyIncome + totalIncome + surplusFromPrev - debtFromPrev
  const cycleSaldo = availableIncome - totalExpense

  const potSummaries: PotSummary[] = pots.map(pot => {
    const spent = allExpenses
      .filter(t => t.pot_id === pot.id)
      .reduce((s, t) => s + Number(t.amount), 0)
    const remaining = (pot.limit_amount ?? 0) - spent
    return {
      id: pot.id, name: pot.name, color: pot.color,
      limit_amount: pot.limit_amount, spent, remaining,
      isOverBudget: pot.limit_amount != null && remaining < 0,
    }
  })

  const totalDebt = cycleSaldo < 0 ? Math.abs(cycleSaldo) : 0
  const totalSurplus = cycleSaldo > 0 ? cycleSaldo : 0

  return {
    monthlyIncome, totalIncome, totalExpense,
    debtFromPrev, surplusFromPrev, availableIncome, cycleSaldo,
    totalDebt, totalSurplus, potSummaries,
    isOverBudget: cycleSaldo < 0,
    needsAlert: potSummaries.some(p => p.isOverBudget),
  }
}

export async function calculateCycleSummary(
  userId: string,
  cycle: CycleInfo
): Promise<CycleSummary> {
  const [sourceRes, pots, rolloverRes, incomeRes, creditExpRes, otherExpRes] = await Promise.all([
    supabase.from('income_sources').select('amount').eq('user_id', userId),

    fetchPotsForCycleWithHistory(userId, cycle.startISO, cycle.endISO),

    supabase.from('cycle_rollovers').select('*')
      .eq('user_id', userId).eq('cycle_start_date', cycle.startISO).maybeSingle(),

    // Receitas pelo date
    supabase.from('transactions').select('amount').eq('user_id', userId)
      .eq('type', 'income')
      .gte('date', cycle.startISO).lte('date', cycle.endISO),

    // Despesas de crédito pelo billing_date
    supabase.from('transactions').select('amount, pot_id').eq('user_id', userId)
      .eq('type', 'expense').eq('payment_method', 'credit')
      .gte('billing_date', cycle.startISO).lte('billing_date', cycle.endISO),

    // Despesas não-crédito + depósitos em meta pelo date
    supabase.from('transactions').select('amount, pot_id').eq('user_id', userId)
      .in('type', ['expense', 'goal_deposit']).neq('payment_method', 'credit')
      .gte('date', cycle.startISO).lte('date', cycle.endISO),
  ])

  const monthlyIncome = ((sourceRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)
  const rollover = rolloverRes.data as any
  const totalIncome = ((incomeRes.data ?? []) as any[]).reduce((s, t) => s + Number(t.amount), 0)

  const allExpenses: any[] = [
    ...((creditExpRes.data ?? []) as any[]),
    ...((otherExpRes.data ?? []) as any[]),
  ]
  const totalExpense = allExpenses.reduce((s, t) => s + Number(t.amount), 0)

  const debtFromPrev = Number(rollover?.total_debt ?? 0)
  const surplusFromPrev = Number(rollover?.total_surplus ?? 0)
  const availableIncome = monthlyIncome + totalIncome + surplusFromPrev - debtFromPrev
  const cycleSaldo = availableIncome - totalExpense

  const potSummaries: PotSummary[] = pots.map(pot => {
    const spent = allExpenses
      .filter(t => t.pot_id === pot.id)
      .reduce((s, t) => s + Number(t.amount), 0)
    const remaining = (pot.limit_amount ?? 0) - spent
    return {
      id: pot.id, name: pot.name, color: pot.color,
      limit_amount: pot.limit_amount, spent, remaining,
      isOverBudget: pot.limit_amount != null && remaining < 0,
    }
  })

  // Debt/surplus baseado no saldo geral do ciclo (não nos potes individualmente)
  const totalDebt = cycleSaldo < 0 ? Math.abs(cycleSaldo) : 0
  const totalSurplus = cycleSaldo > 0 ? cycleSaldo : 0

  return {
    monthlyIncome, totalIncome, totalExpense,
    debtFromPrev, surplusFromPrev, availableIncome, cycleSaldo,
    totalDebt, totalSurplus, potSummaries,
    isOverBudget: cycleSaldo < 0,
    needsAlert: potSummaries.some(p => p.isOverBudget),
  }
}

export async function processCycleClose(
  userId: string,
  nextCycleStart: Date,
  surplusAction: 'goal' | 'emergency' | 'income' | 'discard',
  surplusGoalId: string | null,
  summary: CycleSummary
) {
  const nextStartStr = nextCycleStart.toISOString().split('T')[0]

  await supabase.from('cycle_rollovers').upsert({
    user_id: userId,
    cycle_start_date: nextStartStr,
    total_debt: summary.totalDebt,
    total_surplus: surplusAction === 'income' ? summary.totalSurplus : 0,
    surplus_action: surplusAction,
    surplus_goal_id: surplusGoalId,
    processed: true,
  }, { onConflict: 'user_id,cycle_start_date' })

  if (surplusAction === 'goal' && surplusGoalId && summary.totalSurplus > 0) {
    const { data: goal } = await supabase.from('goals').select('current_amount').eq('id', surplusGoalId).single()
    const newAmount = Number((goal as any)?.current_amount ?? 0) + summary.totalSurplus
    await supabase.from('goals').update({ current_amount: newAmount }).eq('id', surplusGoalId)
    await supabase.from('transactions').insert({
      user_id: userId, type: 'goal_deposit', amount: summary.totalSurplus,
      description: 'Sobra do ciclo → meta', date: nextStartStr,
      pot_id: null, card_id: null, merchant: null, billing_date: null,
      payment_method: 'transfer', is_need: null,
    })
  }

  if (surplusAction === 'emergency' && summary.totalSurplus > 0) {
    const { data: ep } = await supabase.from('pots').select('id')
      .eq('user_id', userId).eq('is_emergency', true).maybeSingle()
    if (ep) {
      await supabase.from('transactions').insert({
        user_id: userId, pot_id: (ep as any).id, type: 'income',
        amount: summary.totalSurplus, description: 'Sobra do ciclo → emergência',
        date: nextStartStr, card_id: null, merchant: null,
        billing_date: null, payment_method: 'transfer', is_need: null,
      })
    }
  }
}

// Recalcula o rollover de saída de um ciclo já encerrado (para cascata em fechamentos retroativos)
export async function recalculateRollover(
  userId: string,
  cycleStartDay: number,
  offset: number
): Promise<void> {
  const cycle = getCycle(cycleStartDay, offset)
  const nextCycle = getCycle(cycleStartDay, offset + 1)

  const { data: existing } = await supabase
    .from('cycle_rollovers')
    .select('surplus_action, surplus_goal_id, processed')
    .eq('user_id', userId)
    .eq('cycle_start_date', nextCycle.startISO)
    .maybeSingle()

  if (!(existing as any)?.processed) return

  const summary = await calculateCycleSummary(userId, cycle)

  await supabase.from('cycle_rollovers').upsert({
    user_id: userId,
    cycle_start_date: nextCycle.startISO,
    total_debt: summary.totalDebt,
    total_surplus: (existing as any).surplus_action === 'income' ? summary.totalSurplus : 0,
    surplus_action: (existing as any).surplus_action,
    surplus_goal_id: (existing as any).surplus_goal_id,
    processed: true,
  }, { onConflict: 'user_id,cycle_start_date' })
}
