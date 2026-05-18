import { supabase } from './supabase'
import { getCycle } from './cycle'

export type PotExpense = {
  potId: string
  potName: string
  potColor: string
  total: number
  limit: number | null
}

export type MonthlyTotal = {
  month: string
  income: number
  expense: number
  label: string
}

export type CreditCommitment = {
  month: string
  label: string
  total: number
  items: { description: string; amount: number; merchant: string | null }[]
  isFuture: boolean
}

export type PaymentMethodShare = {
  method: string
  label: string
  color: string
  total: number
}

export type GoalProgress = {
  id: string
  name: string
  current: number
  target: number
  pct: number
}

export type ReservePoint = {
  month: string
  label: string
  balance: number
}

export type NecessityShare = {
  necessity: number
  desire: number
  unclassified: number
}

export type CreditByCard = {
  cardId: string | null
  cardName: string
  color: string
  total: number
}

export type FinancialScore = {
  controle: number
  poupanca: number
  planejamento: number
  equilibrio: number
  consistencia: number
  total: number
  analysis: string
}

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function toISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

export async function getExpensesByPot(
  userId: string,
  cycleStart: string,
  cycleEnd: string
): Promise<PotExpense[]> {
  const [{ data: txs }, { data: pots }] = await Promise.all([
    supabase
      .from('transactions')
      .select('pot_id, amount')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('date', cycleStart)
      .lte('date', cycleEnd),
    supabase
      .from('pots')
      .select('id, name, color, limit_amount')
      .eq('user_id', userId)
      .is('deleted_at', null),
  ])

  const potMap = new Map((pots ?? []).map(p => [p.id, p]))
  const totals = new Map<string, number>()
  for (const tx of txs ?? []) {
    if (!tx.pot_id) continue
    totals.set(tx.pot_id, (totals.get(tx.pot_id) ?? 0) + Number(tx.amount))
  }

  const result: PotExpense[] = []
  for (const [potId, total] of totals.entries()) {
    const pot = potMap.get(potId)
    if (!pot) continue
    result.push({
      potId,
      potName: pot.name,
      potColor: pot.color ?? '#0F5EA8',
      total,
      limit: pot.limit_amount ? Number(pot.limit_amount) : null,
    })
  }
  return result.sort((a, b) => b.total - a.total)
}

export async function getNecessityShare(
  userId: string,
  cycleStart: string,
  cycleEnd: string
): Promise<NecessityShare> {
  const { data } = await supabase
    .from('transactions')
    .select('amount, is_need')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', cycleStart)
    .lte('date', cycleEnd)

  let necessity = 0
  let desire = 0
  let unclassified = 0
  for (const tx of data ?? []) {
    if (tx.is_need === true) necessity += Number(tx.amount)
    else if (tx.is_need === false) desire += Number(tx.amount)
    else unclassified += Number(tx.amount)
  }
  return { necessity, desire, unclassified }
}

export async function getCreditByCard(
  userId: string,
  cycleStart: string,
  cycleEnd: string
): Promise<CreditByCard[]> {
  const CARD_COLORS = ['#0F5EA8','#1D9E75','#7C3AED','#EA580C','#0891B2','#BA7517','#E24B4A']

  const [{ data: txs }, { data: cards }] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, card_id')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .eq('payment_method', 'credit')
      .gte('date', cycleStart)
      .lte('date', cycleEnd),
    supabase
      .from('credit_cards')
      .select('id, name, last_four')
      .eq('user_id', userId),
  ])

  const cardMap = new Map((cards ?? []).map(c => [c.id, c]))
  const totals  = new Map<string | null, number>()
  for (const tx of txs ?? []) {
    const key = tx.card_id ?? null
    totals.set(key, (totals.get(key) ?? 0) + Number(tx.amount))
  }

  const result: CreditByCard[] = []
  let colorIdx = 0
  for (const [cardId, total] of totals.entries()) {
    const card = cardId ? cardMap.get(cardId) : null
    const cardName = card
      ? `${card.name}${card.last_four ? ` ••••${card.last_four}` : ''}`
      : 'Sem cartão vinculado'
    result.push({
      cardId,
      cardName,
      color: CARD_COLORS[colorIdx % CARD_COLORS.length],
      total,
    })
    colorIdx++
  }
  return result.sort((a, b) => b.total - a.total)
}

export async function getMonthlyTotals(
  userId: string,
  cycleStartDay: number,
  months = 7
): Promise<MonthlyTotal[]> {
  const result: MonthlyTotal[] = []
  const today = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const cycle = getCycle(cycleStartDay, -i)
    const { data } = await supabase
      .from('transactions')
      .select('type, amount, payment_method, billing_date, date')
      .eq('user_id', userId)
      .in('type', ['income', 'expense'])

    let income = 0
    let expense = 0
    for (const tx of data ?? []) {
      const displayDate = tx.payment_method === 'credit' && tx.billing_date
        ? tx.billing_date
        : tx.date
      if (displayDate >= cycle.startISO && displayDate <= cycle.endISO) {
        if (tx.type === 'income') income += Number(tx.amount)
        else expense += Number(tx.amount)
      }
    }
    result.push({
      month: cycle.startISO,
      income,
      expense,
      label: cycle.monthYear,
    })
  }
  return result
}

export async function getMonthlyTotalsOptimized(
  userId: string,
  cycleStartDay: number,
  months = 7
): Promise<MonthlyTotal[]> {
  const cycles = Array.from({ length: months }, (_, i) => getCycle(cycleStartDay, -(months - 1 - i)))
  const earliest = cycles[0].startISO

  const { data } = await supabase
    .from('transactions')
    .select('type, amount, payment_method, billing_date, date')
    .eq('user_id', userId)
    .in('type', ['income', 'expense'])
    .gte('date', earliest)

  const result: MonthlyTotal[] = cycles.map(cycle => {
    let income = 0
    let expense = 0
    for (const tx of data ?? []) {
      const displayDate = tx.payment_method === 'credit' && tx.billing_date
        ? tx.billing_date
        : tx.date
      if (displayDate >= cycle.startISO && displayDate <= cycle.endISO) {
        if (tx.type === 'income') income += Number(tx.amount)
        else expense += Number(tx.amount)
      }
    }
    return { month: cycle.startISO, income, expense, label: cycle.monthYear }
  })
  return result
}

export async function getCreditCommitments(
  userId: string,
  cycleStartDay: number,
  months = 6
): Promise<CreditCommitment[]> {
  const today = new Date()
  const result: CreditCommitment[] = []

  for (let i = -1; i < months - 1; i++) {
    const cycle = getCycle(cycleStartDay, i)
    result.push({
      month: cycle.startISO,
      label: cycle.monthYear,
      total: 0,
      items: [],
      isFuture: i >= 0,
    })
  }

  const earliest = result[0].month
  const latest = result[result.length - 1].month.slice(0, 7) + '-31'

  const { data } = await supabase
    .from('transactions')
    .select('amount, description, merchant, billing_date')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('payment_method', 'credit')
    .not('billing_date', 'is', null)
    .gte('billing_date', earliest)
    .lte('billing_date', latest)

  for (const tx of data ?? []) {
    const bucket = result.find(r => tx.billing_date >= r.month && tx.billing_date <= getCycle(cycleStartDay, result.indexOf(r) - 1).endISO)
    if (!bucket) continue
    bucket.total += Number(tx.amount)
    bucket.items.push({
      description: tx.description ?? 'Sem descrição',
      amount: Number(tx.amount),
      merchant: tx.merchant,
    })
  }

  return result
}

export async function getCreditCommitmentsSimple(
  userId: string,
  cycleStartDay: number,
  months = 6
): Promise<CreditCommitment[]> {
  const today = new Date()
  const todayISO = toISO(today)

  const cycles = Array.from({ length: months }, (_, i) => getCycle(cycleStartDay, i - 1))
  const earliest = cycles[0].startISO
  const latest = cycles[cycles.length - 1].endISO

  const { data } = await supabase
    .from('transactions')
    .select('amount, description, merchant, billing_date')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('payment_method', 'credit')
    .not('billing_date', 'is', null)
    .gte('billing_date', earliest)
    .lte('billing_date', latest)

  return cycles.map(cycle => {
    const items = (data ?? [])
      .filter(tx => tx.billing_date >= cycle.startISO && tx.billing_date <= cycle.endISO)
      .map(tx => ({
        description: tx.description ?? 'Sem descrição',
        amount: Number(tx.amount),
        merchant: tx.merchant,
      }))
    const total = items.reduce((s, i) => s + i.amount, 0)
    return {
      month: cycle.startISO,
      label: cycle.monthYear,
      total,
      items,
      isFuture: cycle.startISO > todayISO,
    }
  })
}

export async function getPaymentMethodDistribution(
  userId: string,
  cycleStart: string,
  cycleEnd: string
): Promise<PaymentMethodShare[]> {
  const { data } = await supabase
    .from('transactions')
    .select('payment_method, amount')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', cycleStart)
    .lte('date', cycleEnd)

  const totals = new Map<string, number>()
  for (const tx of data ?? []) {
    const m = tx.payment_method ?? 'cash'
    totals.set(m, (totals.get(m) ?? 0) + Number(tx.amount))
  }

  const COLORS: Record<string, string> = {
    pix: '#1D9E75',
    credit: '#0F5EA8',
    debit: '#7C3AED',
    cash: '#BA7517',
    transfer: '#0891B2',
    voucher_alimentacao: '#EA580C',
    voucher_refeicao: '#D97706',
  }
  const LABELS: Record<string, string> = {
    pix: 'Pix', credit: 'Crédito', debit: 'Débito',
    cash: 'Dinheiro', transfer: 'Transferência',
    voucher_alimentacao: 'Val. Alimentação', voucher_refeicao: 'Val. Refeição',
  }

  return Array.from(totals.entries())
    .map(([method, total]) => ({
      method,
      label: LABELS[method] ?? method,
      color: COLORS[method] ?? '#7A8499',
      total,
    }))
    .sort((a, b) => b.total - a.total)
}

export async function getGoalsProgress(userId: string): Promise<GoalProgress[]> {
  const { data } = await supabase
    .from('goals')
    .select('id, name, current_amount, target_amount')
    .eq('user_id', userId)
    .eq('status', 'active')

  return (data ?? [])
    .map(g => ({
      id: g.id,
      name: g.name,
      current: Number(g.current_amount),
      target: Number(g.target_amount),
      pct: Number(g.target_amount) > 0 ? Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
}

export async function getEmergencyReserveHistory(
  userId: string,
  months = 6
): Promise<ReservePoint[]> {
  const today = new Date()
  const result: ReservePoint[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    result.push({
      month: toISO(d).slice(0, 7),
      label: MONTHS_SHORT[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2),
      balance: 0,
    })
  }

  const earliest = result[0].month + '-01'
  const { data: reserve } = await supabase
    .from('emergency_reserve')
    .select('current_amount')
    .eq('user_id', userId)
    .maybeSingle()

  const { data: txs } = await supabase
    .from('emergency_reserve_transactions')
    .select('type, amount, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (!txs || txs.length === 0) return result

  // Build running balance per month
  let running = 0
  const monthlyBalances = new Map<string, number>()

  for (const tx of txs) {
    const mo = tx.created_at.slice(0, 7)
    if (tx.type === 'deposit_external' || tx.type === 'deposit_from_cycle') {
      running += Number(tx.amount)
    } else {
      running -= Number(tx.amount)
    }
    monthlyBalances.set(mo, running)
  }

  let lastKnown = 0
  for (const point of result) {
    if (monthlyBalances.has(point.month)) {
      lastKnown = monthlyBalances.get(point.month)!
    }
    point.balance = lastKnown
  }

  return result
}

export async function getFinancialScore(
  userId: string,
  cycleStartDay: number
): Promise<FinancialScore> {
  const today = new Date()
  const currentMonthISO = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

  const [
    { data: pots },
    { data: txsRaw },
    { data: pastScheduled },
  ] = await Promise.all([
    supabase.from('pots').select('id, limit_amount').eq('user_id', userId).is('deleted_at', null),
    supabase.from('transactions').select('type, amount, date, payment_method, billing_date, is_need, pot_id')
      .eq('user_id', userId).in('type', ['income', 'expense']),
    supabase.from('scheduled_transaction_months')
      .select('status, reference_month')
      .eq('user_id', userId)
      .lt('reference_month', currentMonthISO),
  ])

  const cycles6 = Array.from({ length: 6 }, (_, i) => getCycle(cycleStartDay, -(5 - i)))
  const cycle3 = Array.from({ length: 3 }, (_, i) => getCycle(cycleStartDay, -(2 - i)))
  const cycle0 = getCycle(cycleStartDay, 0)

  function txsInCycle(cycle: ReturnType<typeof getCycle>) {
    return (txsRaw ?? []).filter(tx => {
      const d = tx.payment_method === 'credit' && tx.billing_date ? tx.billing_date : tx.date
      return d >= cycle.startISO && d <= cycle.endISO
    })
  }

  // Controle: % potes dentro do limite no ciclo atual
  let controle = 50
  if (pots && pots.length > 0) {
    const txsCurr = txsInCycle(cycle0)
    const potExpenses = new Map<string, number>()
    for (const tx of txsCurr) {
      if (tx.type === 'expense' && tx.pot_id) {
        potExpenses.set(tx.pot_id, (potExpenses.get(tx.pot_id) ?? 0) + Number(tx.amount))
      }
    }
    const withLimit = pots.filter(p => p.limit_amount)
    if (withLimit.length > 0) {
      const inLimit = withLimit.filter(p => (potExpenses.get(p.id) ?? 0) <= Number(p.limit_amount))
      controle = Math.round((inLimit.length / withLimit.length) * 100)
    }
  }

  // Poupança: % renda que sobrou nos últimos 3 ciclos
  let poupanca = 50
  const savingsRates: number[] = []
  for (const cycle of cycle3) {
    const txs = txsInCycle(cycle)
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    if (inc > 0) savingsRates.push(Math.max(0, ((inc - exp) / inc) * 100))
  }
  if (savingsRates.length > 0) {
    poupanca = Math.min(100, Math.round(savingsRates.reduce((s, r) => s + r, 0) / savingsRates.length * 2))
  }

  // Planejamento: 100% se não há agendados pendentes em meses passados;
  // penaliza proporcionalmente a cada mês atrasado (reference_month < mês atual)
  let planejamento = 100
  const pastMonths = pastScheduled ?? []
  if (pastMonths.length > 0) {
    const overdue = pastMonths.filter(m => m.status === 'pending').length
    planejamento = Math.round(Math.max(0, (1 - overdue / pastMonths.length) * 100))
  }

  // Equilíbrio: % de necessidade vs desejo (ideal ~70% necessidade)
  let equilibrio = 50
  const txsCurr0 = txsInCycle(cycle0).filter(t => t.type === 'expense')
  const necessityAmt = txsCurr0.filter(t => t.is_need).reduce((s, t) => s + Number(t.amount), 0)
  const desireAmt = txsCurr0.filter(t => !t.is_need).reduce((s, t) => s + Number(t.amount), 0)
  const totalExp = necessityAmt + desireAmt
  if (totalExp > 0) {
    const pctNecessity = necessityAmt / totalExp
    equilibrio = Math.round(100 - Math.abs(pctNecessity - 0.7) * 200)
    equilibrio = Math.max(0, Math.min(100, equilibrio))
  }

  // Consistência: quantos dos últimos 6 ciclos foram positivos
  let consistencia = 50
  let positiveCycles = 0
  for (const cycle of cycles6) {
    const txs = txsInCycle(cycle)
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    if (inc >= exp) positiveCycles++
  }
  consistencia = Math.round((positiveCycles / 6) * 100)

  const total = Math.round((controle + poupanca + planejamento + equilibrio + consistencia) / 5)

  const scores = { controle, poupanca, planejamento, equilibrio, consistencia }
  const maxKey = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a)[0]
  const minKey = Object.entries(scores).reduce((a, b) => b[1] < a[1] ? b : a)[0]

  const NAMES: Record<string, string> = {
    controle: 'Controle', poupanca: 'Poupança', planejamento: 'Planejamento',
    equilibrio: 'Equilíbrio', consistencia: 'Consistência',
  }
  const analysis = `Seu maior ponto forte é o ${NAMES[maxKey]} (${scores[maxKey as keyof typeof scores]}%). Trabalhe mais em ${NAMES[minKey]} para melhorar seu score geral.`

  return { controle, poupanca, planejamento, equilibrio, consistencia, total, analysis }
}
