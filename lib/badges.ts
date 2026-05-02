import { supabase } from './supabase'
import * as SecureStore from 'expo-secure-store'

export type Badge = {
  key: string
  name: string
  description: string
  icon: string
  type: 'monthly' | 'bimonthly' | 'semester' | 'unique'
  color: string
}

export const ALL_BADGES: Badge[] = [
  { key: 'primeiro_pote', name: 'Primeiro Pote', description: 'Criou seu primeiro pote de orçamento', icon: '🫙', type: 'unique', color: '#0F5EA8' },
  { key: 'primeira_meta', name: 'Sonhador', description: 'Criou sua primeira meta de longo prazo', icon: '🌟', type: 'unique', color: '#BA7517' },
  { key: 'primeiro_ocr', name: 'Leitor de Cupons', description: 'Escaneou seu primeiro cupom fiscal', icon: '📷', type: 'unique', color: '#1D9E75' },
  { key: 'saldo_positivo', name: 'Mês Positivo', description: 'Terminou o mês com saldo positivo', icon: '✅', type: 'monthly', color: '#1D9E75' },
  { key: 'economizador', name: 'Economizador', description: 'Gastou menos de 70% do orçamento total em um mês', icon: '💰', type: 'monthly', color: '#27500A' },
  { key: 'detetive_de_gastos', name: 'Detetive de Gastos', description: 'Escaneou mais de 5 cupons em um mês', icon: '🔍', type: 'monthly', color: '#0F5EA8' },
  { key: 'mestre_do_pote', name: 'Mestre do Pote', description: 'Fechou o mês sem estourar nenhum pote', icon: '🏆', type: 'bimonthly', color: '#BA7517' },
  { key: 'investidor_consistente', name: 'Investidor Consistente', description: 'Transferiu para uma meta por 3 meses seguidos', icon: '📈', type: 'monthly', color: '#1D9E75' },
  { key: 'zero_imprevisto', name: 'Zero Imprevisto', description: 'Manteve o pote de emergência acima de 50%', icon: '🛡️', type: 'semester', color: '#534AB7' },
  { key: 'planejador', name: 'Planejador', description: 'Tem 5 ou mais potes ativos', icon: '📋', type: 'unique', color: '#534AB7' },
]

function getCurrentCycleRange(cycleStart: number): { startStr: string; endStr: string } {
  const today = new Date()
  const day = today.getDate()
  let sm = today.getMonth()
  let sy = today.getFullYear()
  if (day < cycleStart) {
    sm -= 1
    if (sm < 0) { sm = 11; sy -= 1 }
  }
  const start = new Date(sy, sm, cycleStart)
  let em = sm + 1; let ey = sy
  if (em > 11) { em = 0; ey += 1 }
  const end = new Date(ey, em, cycleStart - 1)
  return {
    startStr: start.toISOString().split('T')[0],
    endStr: end.toISOString().split('T')[0],
  }
}

export async function checkAndGrantBadges(
  userId: string,
  cycleStart: number
): Promise<Badge[]> {
  const newBadges: Badge[] = []

  const { data: earned } = await supabase
    .from('user_badges').select('badge_key').eq('user_id', userId)
  const earnedKeys = new Set<string>((earned ?? []).map((b: any) => b.badge_key))

  async function grant(key: string) {
    if (earnedKeys.has(key)) return
    const badge = ALL_BADGES.find(b => b.key === key)
    if (!badge) return
    const { error } = await supabase.from('user_badges').insert({ user_id: userId, badge_key: key })
    if (!error) { newBadges.push(badge); earnedKeys.add(key) }
  }

  const { startStr, endStr } = getCurrentCycleRange(cycleStart)

  const [
    { data: pots },
    { data: goals },
    { data: receipts },
    { data: monthReceipts },
    { data: transactions },
  ] = await Promise.all([
    supabase.from('pots').select('id, limit_amount').eq('user_id', userId),
    supabase.from('goals').select('id').eq('user_id', userId).limit(1),
    supabase.from('receipts').select('id').eq('user_id', userId).eq('processed', true).limit(1),
    supabase.from('receipts').select('id').eq('user_id', userId)
      .gte('created_at', startStr + 'T00:00:00').lte('created_at', endStr + 'T23:59:59'),
    supabase.from('transactions').select('amount, type').eq('user_id', userId)
      .gte('date', startStr).lte('date', endStr),
  ])

  if (pots && pots.length > 0) await grant('primeiro_pote')
  if (goals && goals.length > 0) await grant('primeira_meta')
  if (receipts && receipts.length > 0) await grant('primeiro_ocr')
  if (monthReceipts && monthReceipts.length >= 5) await grant('detetive_de_gastos')
  if (pots && pots.length >= 5) await grant('planejador')

  if (transactions && transactions.length > 0) {
    const txList = transactions as any[]
    const income = txList.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const expense = txList.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

    if (income > 0 && expense < income) await grant('saldo_positivo')

    const totalBudget = ((pots ?? []) as any[]).reduce((s, p) => s + Number(p.limit_amount ?? 0), 0)
    if (totalBudget > 0 && expense < totalBudget * 0.7) await grant('economizador')
  }

  return newBadges
}

const BADGE_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

// Use this on app startup — skips all 5 queries if checked within the last hour.
// Use checkAndGrantBadges directly for explicit user actions (cycle close, new pot, etc.)
export async function checkAndGrantBadgesOnStartup(
  userId: string,
  cycleStart: number,
): Promise<Badge[]> {
  try {
    const lastCheck = await SecureStore.getItemAsync(`badge_check_${userId}`)
    if (lastCheck && Date.now() - Number(lastCheck) < BADGE_COOLDOWN_MS) return []
    await SecureStore.setItemAsync(`badge_check_${userId}`, String(Date.now()))
  } catch {
    // SecureStore failure must not block startup
  }
  return checkAndGrantBadges(userId, cycleStart)
}

export async function getEarnedBadgeKeys(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from('user_badges').select('badge_key').eq('user_id', userId)
  return new Set<string>((data ?? []).map((b: any) => b.badge_key))
}
