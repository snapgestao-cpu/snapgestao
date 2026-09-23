/**
 * Camada 2 da IA — resumo semanal automático ("check-in do CFO").
 *
 * Curto (3-5 frases), gerado 1x por semana por usuário e cacheado em
 * `weekly_insights` (não regenera a cada abertura da aba Gráficos). Disponível
 * para Free e Premium na mesma cadência. NÃO consome a cota mensal de ai_tokens
 * (chama `callAI` direto, como o alerta reativo da Camada 1) — o próprio cache
 * (1 linha por semana) já limita a 1 chamada de IA por usuário por semana.
 *
 * Semana = segunda a domingo do calendário (independente do cycle_start).
 *
 * IMPORTANTE: toda chamada a `weekly_insights` trata `{ error }` com `console.warn`
 * (não silenciar erros de banco — lição do bug de smart_merchants).
 */
import { supabase } from './supabase'
import { getAIProvider, callAI } from './ai-provider'
import { brl } from './finance'
import type { Plan } from '../constants/plans'

// ── Núcleo puro (testável) ───────────────────────────────────────────────────

function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Segunda-feira (ISO) da semana que contém `date`. Semana = seg..dom. Usa componentes
// LOCAIS (a "semana" do usuário), determinístico em teste via `new Date(y, m, d)`.
export function mondayOfWeek(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dow = d.getDay()                 // 0=Dom, 1=Seg, ... 6=Sáb
  const diff = dow === 0 ? -6 : 1 - dow  // dias até a segunda desta semana
  d.setDate(d.getDate() + diff)
  return fmtISO(d)
}

// Soma dias a uma data ISO (YYYY-MM-DD) preservando calendário.
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return fmtISO(dt)
}

// Intervalo seg..dom a partir da segunda-feira.
export function weekRangeFromMonday(mondayISO: string): { startISO: string; endISO: string } {
  return { startISO: mondayISO, endISO: addDaysISO(mondayISO, 6) }
}

// Variação percentual vs. valor anterior. null se não houver base (semana anterior 0).
export function pctChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null
  return ((current - previous) / previous) * 100
}

// Rótulo "DD/MM a DD/MM" a partir de duas datas ISO.
export function formatWeekLabel(startISO: string, endISO: string): string {
  const dm = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
  return `${dm(startISO)} a ${dm(endISO)}`
}

export type WeeklyContext = {
  weekLabel: string
  total: number
  prevTotal: number
  pct: number | null
  topPots: { name: string; amount: number }[]
  topMerchants: { name: string; amount: number }[]
}

// Monta o prompt do usuário (puro, sem I/O) com os valores reais em R$.
export function buildWeeklyPrompt(ctx: WeeklyContext): string {
  const cmp = ctx.pct == null
    ? '- Sem semana anterior comparável (sem gastos na semana passada).'
    : `- Semana passada: ${brl(ctx.prevTotal)} (${ctx.pct >= 0 ? '+' : ''}${Math.round(ctx.pct)}% nesta semana).`
  const pots = ctx.topPots.length
    ? ctx.topPots.map(p => `  - ${p.name}: ${brl(p.amount)}`).join('\n')
    : '  - (nenhum pote com gasto)'
  const merchants = ctx.topMerchants.length
    ? ctx.topMerchants.map(m => `  - ${m.name}: ${brl(m.amount)}`).join('\n')
    : '  - (nenhum estabelecimento registrado)'
  return [
    `Resumo da semana (${ctx.weekLabel}):`,
    `- Total gasto na semana: ${brl(ctx.total)}`,
    cmp,
    '- Principais potes:',
    pots,
    '- Principais estabelecimentos:',
    merchants,
    '',
    'Faça o check-in curto da semana usando SÓ os valores acima.',
  ].join('\n')
}

const WEEKLY_SYSTEM_PROMPT =
  'Você é o "CFO pessoal" do usuário no app SnapGestão. Faça um check-in curto da ' +
  'semana, em português, segunda pessoa ("você"), com 3 a 5 frases. Tom objetivo e ' +
  'encorajador, direto ao ponto. Use SOMENTE os valores em R$ e nomes que estão no ' +
  'prompt. NUNCA invente, estime ou cite números que não estejam explicitamente no ' +
  'prompt. Sem saudação longa, no máximo 2 emojis. Responda apenas o resumo.'

// ── Agregação da semana (segue o padrão de spentByPot/topMerchants do mentor) ──

type WeekAgg = { total: number; byPot: Record<string, number>; byMerchant: Record<string, number> }

async function fetchWeekAggregates(userId: string, startISO: string, endISO: string): Promise<WeekAgg> {
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, pot_id, merchant')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', startISO)
    .lte('date', endISO)
  if (error) {
    console.warn('[weekly_insights] agregação da semana falhou:', error.message)
    return { total: 0, byPot: {}, byMerchant: {} }
  }
  const agg: WeekAgg = { total: 0, byPot: {}, byMerchant: {} }
  for (const t of (data ?? []) as any[]) {
    const amt = Number(t.amount) || 0
    agg.total += amt
    if (t.pot_id) agg.byPot[t.pot_id] = (agg.byPot[t.pot_id] ?? 0) + amt
    const m = (t.merchant ?? '').trim()
    if (m) agg.byMerchant[m] = (agg.byMerchant[m] ?? 0) + amt
  }
  return agg
}

function topN(map: Record<string, number>, n: number): { key: string; amount: number }[] {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, amount]) => ({ key, amount }))
}

/**
 * Retorna o resumo semanal do usuário.
 *
 * Cache com invalidação por novidade (mesma semana):
 * - Sem cache da semana → gera pela 1ª vez e salva (upsert).
 * - Cache gerado HOJE → devolve direto (sem query extra, sem IA).
 * - Cache gerado num dia anterior da mesma semana → só regenera se houver >= 1
 *   transação NOVA (expense, dentro da semana, created_at > última geração); senão
 *   devolve o cache (dia sem novidade não custa IA). Ao regenerar, reagrega a semana
 *   inteira e dá upsert (atualiza a mesma linha + novo timestamp).
 *
 * Segunda seguinte = nova semana (novo week_start) → volta ao caso "1ª geração".
 * NÃO consome ai_tokens (callAI direto); igual p/ Free e Premium.
 * Risco aceito: editar/excluir lançamento antigo (sem criar um novo) pode não
 * disparar regeneração — depende de created_at cobrir só criação (documentado).
 * Nunca lança: em falha (banco/IA) devolve o cache anterior ou '' (estado vazio).
 */
export async function getOrGenerateWeeklyInsight(userId: string, plan: Plan, cycleStart: number): Promise<string> {
  void cycleStart  // semana é calendário (seg-dom), independente do cycle_start; mantido por compat de API
  const weekStart = mondayOfWeek(new Date())
  const { startISO, endISO } = weekRangeFromMonday(weekStart)

  // 1. Cache da semana + timestamp da última geração.
  const { data: cached, error: selErr } = await supabase
    .from('weekly_insights')
    .select('content, generated_at')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (selErr) console.warn('[weekly_insights] leitura do cache falhou:', selErr.message)

  const cachedContent = (cached as any)?.content as string | undefined
  const generatedAt = (cached as any)?.generated_at as string | null | undefined

  if (cachedContent) {
    const todayISO = new Date().toISOString().split('T')[0]
    const genDay = generatedAt ? String(generatedAt).split('T')[0] : null
    // Gerado hoje → cache direto.
    if (genDay === todayISO) return cachedContent
    if (!generatedAt) return cachedContent  // sem timestamp (não deveria) → não gasta IA
    // Gerado num dia anterior desta semana: só regenera se houve transação nova.
    const { count, error: cntErr } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('date', startISO).lte('date', endISO)
      .gt('created_at', generatedAt)
    if (cntErr) console.warn('[weekly_insights] checagem de novidade falhou:', cntErr.message)
    if (!count) return cachedContent  // nada novo desde a última geração → cache, zero IA
    // há transação nova → cai pra regenerar abaixo
  }

  // 2. (Re)gera: agrega a semana (mesma janela seg-dom) + a anterior, gera via IA.
  const prev = weekRangeFromMonday(addDaysISO(weekStart, -7))
  const [thisWeek, prevWeek] = await Promise.all([
    fetchWeekAggregates(userId, startISO, endISO),
    fetchWeekAggregates(userId, prev.startISO, prev.endISO),
  ])

  // Sem gastos na semana → sem resumo (mantém o cache anterior se houver).
  if (thisWeek.total <= 0) return cachedContent ?? ''

  // Resolve nomes dos potes do top.
  const topPotIds = topN(thisWeek.byPot, 3)
  let potNames: Record<string, string> = {}
  if (topPotIds.length) {
    const { data: pots, error: potErr } = await supabase
      .from('pots').select('id, name').in('id', topPotIds.map(p => p.key))
    if (potErr) console.warn('[weekly_insights] nomes de potes falharam:', potErr.message)
    potNames = Object.fromEntries(((pots ?? []) as any[]).map(p => [p.id, p.name]))
  }

  const ctx: WeeklyContext = {
    weekLabel: formatWeekLabel(startISO, endISO),
    total: thisWeek.total,
    prevTotal: prevWeek.total,
    pct: pctChange(thisWeek.total, prevWeek.total),
    topPots: topPotIds.map(p => ({ name: potNames[p.key] ?? 'Sem pote', amount: p.amount })),
    topMerchants: topN(thisWeek.byMerchant, 3).map(m => ({ name: m.key, amount: m.amount })),
  }

  // 3. Gera via IA.
  let content = ''
  try {
    content = (await callAI(getAIProvider(plan), buildWeeklyPrompt(ctx), WEEKLY_SYSTEM_PROMPT)).trim()
  } catch {
    return cachedContent ?? ''  // falha de IA → mantém cache anterior (ou vazio na 1ª vez)
  }
  if (!content) return cachedContent ?? ''

  // 4. Upsert (atualiza a mesma linha da semana) + novo timestamp de geração.
  const { error: upErr } = await supabase
    .from('weekly_insights')
    .upsert(
      { user_id: userId, week_start: weekStart, content, generated_at: new Date().toISOString() },
      { onConflict: 'user_id,week_start' },
    )
  if (upErr) console.warn('[weekly_insights] upsert falhou:', upErr.message)

  return content
}
