/**
 * Alerta reativo por lançamento notável.
 *
 * Roda depois de salvar um gasto (NewExpenseModal / EditTransactionModal, de forma
 * não-bloqueante). A checagem de "notável" é 100% determinística (SQL/matemática,
 * gratuita); só QUANDO for notável é que chama a IA para redigir UMA frase curta.
 *
 * NÃO usar no import em massa (ImportFileModal.saveAll) — geraria custo/ruído.
 * NÃO consome a cota mensal de ai_tokens (relatórios completos); usa um guard
 * próprio de no máximo 5 chamadas de IA por usuário por dia (AsyncStorage).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { getCycle } from './cycle'
import { getPotAtMonth } from './pot-history'
import { getAIProvider, callAI } from './ai-provider'
import { brl } from './finance'
import type { Plan } from '../constants/plans'

const MAX_AI_INSIGHTS_PER_DAY = 5
const OUTLIER_FACTOR = 2.5
const OUTLIER_MIN_HISTORY = 3

export type TransactionInsightParams = {
  userId: string
  plan: Plan
  potId: string | null
  amount: number
  merchant: string
  description: string
  cycleStart: number
  transactionId?: string  // opcional: exclui a própria transação da média (outlier)
}

// ── Núcleo determinístico (puro, testável) ───────────────────────────────────
// Detecta se o gasto fez o pote CRUZAR 80% ou 100% do limite (antes vs. depois).
export function detectThresholdCrossing(
  spentBefore: number,
  spentAfter: number,
  limit: number | null,
): 'over-limit' | 'near-limit' | null {
  if (!(limit && limit > 0)) return null
  const pctBefore = spentBefore / limit
  const pctAfter = spentAfter / limit
  if (pctBefore < 1 && pctAfter >= 1) return 'over-limit'
  if (pctBefore < 0.8 && pctAfter >= 0.8) return 'near-limit'
  return null
}

// Outlier se amount > factor × média dos lançamentos anteriores, e só com histórico
// mínimo (evita falso positivo em usuário novo).
export function isAmountOutlier(
  amount: number,
  priorAmounts: number[],
  factor = OUTLIER_FACTOR,
  minHistory = OUTLIER_MIN_HISTORY,
): boolean {
  if (priorAmounts.length < minHistory) return false
  const avg = priorAmounts.reduce((s, a) => s + a, 0) / priorAmounts.length
  return avg > 0 && amount > factor * avg
}

function averageOf(nums: number[]): number {
  return nums.length ? nums.reduce((s, a) => s + a, 0) / nums.length : 0
}

// ── Guard de custo (5 chamadas de IA/dia por chave de data) ──────────────────
function todayCountKey(): string {
  return `ai_insight_count_${new Date().toISOString().split('T')[0]}`
}
async function getInsightAICount(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(todayCountKey())
    return v ? (parseInt(v, 10) || 0) : 0
  } catch { return 0 }
}
async function incrementInsightAICount(): Promise<void> {
  try {
    const c = await getInsightAICount()
    await AsyncStorage.setItem(todayCountKey(), String(c + 1))
  } catch { /* AsyncStorage indisponível → não bloqueia */ }
}

// ── Gasto do pote no ciclo vigente (mesmo padrão de cycleClose/calculateCycleSummary:
//    crédito por billing_date, o resto por date; só despesas + goal_deposit) ──
async function fetchPotSpentInCycle(userId: string, potId: string, startISO: string, endISO: string): Promise<number> {
  const [creditRes, otherRes] = await Promise.all([
    supabase.from('transactions').select('amount').eq('user_id', userId).eq('pot_id', potId)
      .eq('type', 'expense').eq('payment_method', 'credit')
      .gte('billing_date', startISO).lte('billing_date', endISO),
    supabase.from('transactions').select('amount').eq('user_id', userId).eq('pot_id', potId)
      .in('type', ['expense', 'goal_deposit']).neq('payment_method', 'credit')
      .gte('date', startISO).lte('date', endISO),
  ])
  const sum = (rows: any[] | null) => (rows ?? []).reduce((s, t) => s + Number(t.amount), 0)
  return sum(creditRes.data as any[]) + sum(otherRes.data as any[])
}

// Limite/nome do pote no mês vigente (pot_history com fallback na tabela pots).
async function fetchPotLimitName(potId: string, cycleStart: number): Promise<{ name: string; limit: number | null } | null> {
  const hist = await getPotAtMonth(potId, cycleStart, 0)
  if (hist) return { name: hist.name, limit: hist.limit_amount != null ? Number(hist.limit_amount) : null }
  const { data } = await supabase.from('pots').select('name, limit_amount').eq('id', potId).maybeSingle()
  if (!data) return null
  return { name: (data as any).name, limit: (data as any).limit_amount != null ? Number((data as any).limit_amount) : null }
}

// Últimos valores do mesmo estabelecimento (ou, sem merchant, do mesmo pote),
// excluindo a própria transação. Usado na checagem de outlier.
async function fetchPriorAmounts(p: TransactionInsightParams): Promise<number[]> {
  let q = supabase.from('transactions').select('amount, id').eq('user_id', p.userId).eq('type', 'expense')
  if (p.merchant.trim()) q = q.ilike('merchant', p.merchant.trim())
  else if (p.potId) q = q.eq('pot_id', p.potId)
  else return []
  const { data } = await q.order('date', { ascending: false }).limit(30)
  return ((data ?? []) as any[])
    .filter(t => t.id !== p.transactionId)
    .map(t => Number(t.amount))
}

const INSIGHT_SYSTEM_PROMPT =
  'Você é um assistente financeiro do app SnapGestão. Gere UMA única frase curta ' +
  '(no máximo ~25 palavras), direta, em português e em segunda pessoa ("você"), ' +
  'alertando sobre um lançamento notável que o usuário acabou de registrar. Use os ' +
  'valores reais em R$ que estão no prompt. NUNCA invente, estime ou cite números que ' +
  'não estejam explicitamente no prompt. Sem saudação, sem introdução, no máximo 1 emoji, ' +
  'sem conselhos genéricos. Responda apenas a frase.'

/**
 * Avalia se o lançamento é "notável" (determinístico) e, se for, retorna UMA frase
 * curta redigida pela IA. Retorna null (sem chamar IA) na esmagadora maioria dos casos.
 */
export async function evaluateTransactionInsight(p: TransactionInsightParams): Promise<string | null> {
  if (!(p.amount > 0)) return null

  const { startISO, endISO } = getCycle(p.cycleStart, 0)

  // ── Checagem determinística (gratuita) ──
  const reasons: string[] = []
  let potName: string | null = null
  let potLimit: number | null = null
  let spentBefore = 0
  let spentAfter = 0

  if (p.potId) {
    const info = await fetchPotLimitName(p.potId, p.cycleStart)
    if (info && info.limit != null && info.limit > 0) {
      potName = info.name
      potLimit = info.limit
      spentAfter = await fetchPotSpentInCycle(p.userId, p.potId, startISO, endISO)
      // "antes" só é válido se esta transação de fato entrou neste ciclo.
      if (p.amount <= spentAfter) {
        spentBefore = spentAfter - p.amount
        const crossing = detectThresholdCrossing(spentBefore, spentAfter, potLimit)
        if (crossing === 'over-limit') {
          reasons.push(`este gasto estourou o limite do pote "${potName}" (limite ${brl(potLimit)}, já gasto ${brl(spentAfter)})`)
        } else if (crossing === 'near-limit') {
          reasons.push(`este gasto levou o pote "${potName}" a ${Math.round((spentAfter / potLimit) * 100)}% do limite (limite ${brl(potLimit)}, já gasto ${brl(spentAfter)})`)
        }
      }
    }
  }

  // Outlier de valor (só com histórico mínimo, pra não gerar falso positivo em usuário novo).
  const priorAmounts = await fetchPriorAmounts(p)
  if (isAmountOutlier(p.amount, priorAmounts)) {
    const alvo = p.merchant.trim() ? `em ${p.merchant.trim()}` : (potName ? `no pote "${potName}"` : 'nesse tipo de gasto')
    reasons.push(`o valor ${brl(p.amount)} ${alvo} é bem acima da média dos últimos lançamentos (~${brl(averageOf(priorAmounts))})`)
  }

  if (reasons.length === 0) return null  // nada notável → ZERO chamada de IA

  // ── Guard de custo (não consome ai_tokens) ──
  const count = await getInsightAICount()
  if (count >= MAX_AI_INSIGHTS_PER_DAY) return null

  // ── IA: UMA frase curta com os valores reais ──
  const promptLines = [
    'Contexto de um lançamento que o usuário acabou de registrar:',
    `- Valor do lançamento: ${brl(p.amount)}`,
    p.merchant.trim() ? `- Estabelecimento: ${p.merchant.trim()}` : null,
    p.description.trim() ? `- Descrição: ${p.description.trim()}` : null,
    potName ? `- Pote: ${potName}` : null,
    potLimit != null ? `- Limite do pote: ${brl(potLimit)}` : null,
    p.potId && potLimit != null ? `- Gasto no pote antes deste lançamento: ${brl(spentBefore)}` : null,
    p.potId && potLimit != null ? `- Gasto no pote depois deste lançamento: ${brl(spentAfter)}` : null,
    '',
    `Por que é notável: ${reasons.join('; ')}.`,
    'Gere UMA frase curta alertando o usuário, usando só os valores acima.',
  ].filter(Boolean).join('\n')

  try {
    const text = await callAI(getAIProvider(p.plan), promptLines, INSIGHT_SYSTEM_PROMPT)
    await incrementInsightAICount()
    const sentence = text.trim()
    return sentence || null
  } catch {
    return null  // falha de IA nunca vira toast de erro
  }
}
