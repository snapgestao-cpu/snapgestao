import { supabase } from './supabase'
import { CycleInfo } from './cycle'

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

export async function calculateCycleSummary(
  userId: string,
  cycle: CycleInfo
): Promise<CycleSummary> {
  const [txRes, sourceRes, potsRes, rolloverRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', userId)
      .gte('date', cycle.startISO).lte('date', cycle.endISO),
    supabase.from('income_sources').select('amount').eq('user_id', userId),
    supabase.from('pots').select('*').eq('user_id', userId).eq('is_emergency', false),
    supabase.from('cycle_rollovers').select('*')
      .eq('user_id', userId).eq('cycle_start_date', cycle.startISO).maybeSingle(),
  ])

  const transactions = (txRes.data ?? []) as any[]
  const monthlyIncome = ((sourceRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)
  const pots = (potsRes.data ?? []) as any[]
  const rollover = rolloverRes.data as any

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0)

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0)

  const debtFromPrev = Number(rollover?.total_debt ?? 0)
  const surplusFromPrev = Number(rollover?.total_surplus ?? 0)
  const availableIncome = monthlyIncome + totalIncome + surplusFromPrev - debtFromPrev
  const cycleSaldo = availableIncome - totalExpense

  const potSummaries: PotSummary[] = pots.map(pot => {
    const spent = transactions
      .filter(t => t.pot_id === pot.id && t.type === 'expense')
      .reduce((s, t) => s + Number(t.amount), 0)
    const remaining = (pot.limit_amount ?? 0) - spent
    return { id: pot.id, name: pot.name, color: pot.color, limit_amount: pot.limit_amount, spent, remaining, isOverBudget: remaining < 0 }
  })

  const totalDebt = potSummaries.filter(p => p.isOverBudget).reduce((s, p) => s + Math.abs(p.remaining), 0)
  const totalSurplus = potSummaries.filter(p => !p.isOverBudget && p.remaining > 0).reduce((s, p) => s + p.remaining, 0)

  return {
    monthlyIncome, totalIncome, totalExpense,
    debtFromPrev, surplusFromPrev, availableIncome, cycleSaldo,
    totalDebt, totalSurplus, potSummaries,
    isOverBudget: totalDebt > 0,
    needsAlert: totalDebt > monthlyIncome * 0.1,
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
