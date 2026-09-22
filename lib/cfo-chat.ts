/**
 * Fase 3a da IA — chat "Fale com seu CFO" (SOMENTE LEITURA).
 *
 * Loop de tool calling client-side (mesmo padrão de fetch cru de lib/ai-provider.ts,
 * o app não usa o SDK Anthropic). Ferramentas de LEITURA apenas — o assistente nunca
 * cria/edita/exclui nada. Provider por plano: Free → Groq (function calling estilo
 * OpenAI), Premium → Claude Haiku (tool_use/tool_result nativo da Messages API) +
 * busca na web (server tool `web_search`). Limite diário próprio (AsyncStorage),
 * NÃO consome a cota mensal de ai_tokens.
 *
 * Segurança de dados: só acessa dados do próprio usuário (queries com `.eq('user_id',
 * userId)`, protegidas por RLS) e a base agregada/anônima `price_database`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { getCycle } from './cycle'
import { fetchPotsForCycleWithHistory } from './pot-history'
import { computeCycleSummaryFromData } from './cycleClose'
import { getPriceComparison, getUserCity } from './price-database'
import { getAIProvider, getApiKey, AI_PROVIDER_INFO } from './ai-provider'
import { brl } from './finance'
import type { Plan } from '../constants/plans'

const AI_TIMEOUT_MS = 90_000
const MAX_TOOL_ITERS = 6            // corta loop de tool calling (segurança)
const MAX_TX_ROWS = 50             // teto de linhas em get_transactions

export type ChatTurn = { role: 'user' | 'assistant'; text: string }

// ── Guard de limite diário (puro + AsyncStorage) ─────────────────────────────
export function dailyMessageLimit(plan: Plan): number {
  return plan === 'premium' ? 40 : 10
}
export function isWithinDailyLimit(count: number, plan: Plan): boolean {
  return count < dailyMessageLimit(plan)
}
// Groq entrega os argumentos como string JSON; Claude já entrega objeto. Normaliza.
export function parseToolInput(raw: any): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') { try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {} } catch { return {} } }
  return {}
}

function dailyCountKey(): string {
  return `cfo_chat_count_${new Date().toISOString().split('T')[0]}`
}
export async function getCfoChatCount(): Promise<number> {
  try { const v = await AsyncStorage.getItem(dailyCountKey()); return v ? (parseInt(v, 10) || 0) : 0 } catch { return 0 }
}
async function incrementCfoChatCount(): Promise<void> {
  try { const c = await getCfoChatCount(); await AsyncStorage.setItem(dailyCountKey(), String(c + 1)) } catch { /* noop */ }
}

// ── Ferramentas (LEITURA) ────────────────────────────────────────────────────
type ToolCtx = { userId: string; cycleStart: number }

const TOOLS = [
  {
    name: 'get_pot_summary',
    description: 'Gasto e limite de cada pote (envelope de orçamento) do usuário num ciclo. Use para perguntas sobre orçamento, potes, quanto sobrou/estourou. cycle_offset: 0 = ciclo atual, -1 = anterior, etc.',
    input_schema: {
      type: 'object',
      properties: { cycle_offset: { type: 'integer', description: '0 = atual, negativo = ciclos passados' } },
      required: [],
    },
  },
  {
    name: 'get_transactions',
    description: 'Lista lançamentos do usuário. Filtros opcionais: start_date/end_date (AAAA-MM-DD), pot_name (nome do pote), merchant (estabelecimento), type ("expense" ou "income"). Retorna no máximo 50 linhas, das mais recentes.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'AAAA-MM-DD' },
        end_date: { type: 'string', description: 'AAAA-MM-DD' },
        pot_name: { type: 'string' },
        merchant: { type: 'string' },
        type: { type: 'string', enum: ['expense', 'income'] },
        limit: { type: 'integer', description: 'máx 50' },
      },
      required: [],
    },
  },
  {
    name: 'get_price_comparison',
    description: 'Compara o preço de um item na base colaborativa e anônima de preços (cupons fiscais dos últimos 30 dias), agrupado por estabelecimento. city opcional (padrão: cidade do usuário).',
    input_schema: {
      type: 'object',
      properties: { item_name: { type: 'string' }, city: { type: 'string' } },
      required: ['item_name'],
    },
  },
]

async function toolGetPotSummary(ctx: ToolCtx, input: Record<string, any>) {
  const offset = Number.isFinite(Number(input.cycle_offset)) ? Math.trunc(Number(input.cycle_offset)) : 0
  const cycle = getCycle(ctx.cycleStart, offset)
  const [pots, creditRes, nonCreditRes] = await Promise.all([
    fetchPotsForCycleWithHistory(ctx.userId, cycle.startISO, cycle.endISO),
    supabase.from('transactions').select('amount, type, pot_id').eq('user_id', ctx.userId)
      .eq('payment_method', 'credit').not('billing_date', 'is', null)
      .gte('billing_date', cycle.startISO).lte('billing_date', cycle.endISO),
    supabase.from('transactions').select('amount, type, pot_id').eq('user_id', ctx.userId)
      .neq('payment_method', 'credit').gte('date', cycle.startISO).lte('date', cycle.endISO),
  ])
  // Reaproveita o cálculo de gasto por pote de cycleClose (sem duplicar).
  const summary = computeCycleSummaryFromData(
    pots as any[], [], null,
    (nonCreditRes.data ?? []) as any[], (creditRes.data ?? []) as any[],
  )
  return {
    cycle: cycle.monthYear,
    total_gasto: brl(summary.totalExpense),
    sem_pote: summary.unassignedExpense > 0 ? brl(summary.unassignedExpense) : undefined,
    potes: summary.potSummaries.map(p => ({
      nome: p.name,
      limite: p.limit_amount != null ? brl(p.limit_amount) : 'sem limite',
      gasto: brl(p.spent),
      saldo: brl(p.remaining),
      estourou: p.isOverBudget,
    })),
  }
}

async function toolGetTransactions(ctx: ToolCtx, input: Record<string, any>) {
  const limit = Math.min(Number(input.limit) > 0 ? Math.trunc(Number(input.limit)) : MAX_TX_ROWS, MAX_TX_ROWS)

  // Mapa id→nome de pote (para exibir e resolver pot_name).
  const { data: potsData } = await supabase.from('pots').select('id, name').eq('user_id', ctx.userId)
  const potById: Record<string, string> = {}
  const potIdsByName: string[] = []
  const wantedPot = String(input.pot_name ?? '').trim().toLowerCase()
  for (const p of (potsData ?? []) as any[]) {
    potById[p.id] = p.name
    if (wantedPot && String(p.name).toLowerCase().includes(wantedPot)) potIdsByName.push(p.id)
  }

  let q = supabase.from('transactions')
    .select('date, description, merchant, amount, type, pot_id, payment_method')
    .eq('user_id', ctx.userId)
  if (input.type === 'expense' || input.type === 'income') q = q.eq('type', input.type)
  if (input.start_date) q = q.gte('date', String(input.start_date))
  if (input.end_date) q = q.lte('date', String(input.end_date))
  if (input.merchant) q = q.ilike('merchant', `%${String(input.merchant).trim()}%`)
  if (wantedPot) {
    if (potIdsByName.length === 0) return { total: 0, lancamentos: [], nota: `Nenhum pote encontrado com "${input.pot_name}".` }
    q = q.in('pot_id', potIdsByName)
  }
  const { data } = await q.order('date', { ascending: false }).limit(limit)
  const rows = (data ?? []) as any[]
  return {
    total: rows.length,
    lancamentos: rows.map(t => ({
      data: t.date,
      descricao: t.description ?? '',
      estabelecimento: t.merchant ?? '',
      valor: brl(Number(t.amount)),
      tipo: t.type,
      pote: t.pot_id ? (potById[t.pot_id] ?? 'Sem pote') : 'Sem pote',
      pagamento: t.payment_method,
    })),
  }
}

async function toolGetPriceComparison(ctx: ToolCtx, input: Record<string, any>) {
  const itemName = String(input.item_name ?? '').trim()
  if (!itemName) return { error: 'Informe o nome do item.' }
  const city = input.city ? String(input.city).trim() : await getUserCity(ctx.userId)
  const rows = await getPriceComparison(itemName, city)
  return {
    item: itemName,
    cidade: city ?? 'todas',
    resultados: rows.slice(0, 8).map(r => ({
      estabelecimento: r.establishment,
      menor: brl(r.min_price),
      medio: brl(r.avg_price),
      maior: brl(r.max_price),
      amostras: r.count,
    })),
  }
}

async function executeTool(ctx: ToolCtx, name: string, rawInput: any): Promise<any> {
  const input = parseToolInput(rawInput)
  try {
    if (name === 'get_pot_summary') return await toolGetPotSummary(ctx, input)
    if (name === 'get_transactions') return await toolGetTransactions(ctx, input)
    if (name === 'get_price_comparison') return await toolGetPriceComparison(ctx, input)
    return { error: `Ferramenta desconhecida: ${name}` }
  } catch (e: any) {
    console.warn('[cfo-chat] falha na ferramenta', name, e?.message)
    return { error: 'Não foi possível buscar esses dados agora.' }
  }
}

const CFO_SYSTEM_PROMPT =
`Você é o "CFO pessoal" do usuário no app SnapGestão — especialista em controle financeiro pessoal. Responda em português, em segunda pessoa ("você"), de forma clara, objetiva e concisa.

REGRAS:
- Baseie-se SOMENTE nos dados retornados pelas ferramentas (potes, lançamentos, comparação de preços) e, quando disponível, na busca na web. NUNCA invente valores em R$, nomes de potes/estabelecimentos ou datas que não vieram das ferramentas.
- Se não houver dados suficientes, diga isso claramente e sugira o que registrar — não chute números.
- Os dados são EXCLUSIVAMENTE do usuário atual. NUNCA mencione, compare ou infira dados de outros usuários. A base de preços é agregada e anônima — use só como referência de mercado, nunca atribua a pessoas.
- Você é SOMENTE LEITURA: não cria, edita nem exclui lançamentos. Se pedirem uma ação, explique como fazer no app.
- Use as ferramentas sempre que precisar de números reais; cite os valores em R$ como vieram das ferramentas.`

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// ── Loop Claude (tool_use/tool_result nativo) ────────────────────────────────
// web_search: server tool `web_search_20250305` (variante básica GA — o Premium roda
// Haiku 4.5). Se o request falhar com a busca habilitada, refaz uma vez sem ela.
async function claudeRequest(apiKey: string, system: string, messages: any[], includeWebSearch: boolean): Promise<any> {
  const tools: any[] = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
  if (includeWebSearch) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 })
  const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: AI_PROVIDER_INFO.claude.model, max_tokens: 2048, system, messages, tools }),
  })
  if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`)
  return resp.json()
}

async function runClaudeChat(apiKey: string, system: string, neutral: { role: string; content: string }[], ctx: ToolCtx): Promise<string> {
  const msgs: any[] = neutral.map(m => ({ role: m.role, content: m.content }))
  let webSearch = true
  for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
    let data: any
    try {
      data = await claudeRequest(apiKey, system, msgs, webSearch)
    } catch (e) {
      if (webSearch) { webSearch = false; continue }  // fallback: refaz sem web search
      throw e
    }
    const content: any[] = data.content ?? []
    msgs.push({ role: 'assistant', content })
    if (data.stop_reason === 'tool_use') {
      const toolResults: any[] = []
      for (const block of content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(ctx, block.name, block.input)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        }
      }
      if (toolResults.length === 0) break  // só server tools (web_search) resolvidos server-side
      msgs.push({ role: 'user', content: toolResults })
      continue
    }
    return content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
  }
  // Última tentativa: pega qualquer texto do último assistant.
  const last = msgs[msgs.length - 1]
  if (last?.role === 'assistant' && Array.isArray(last.content)) {
    return last.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim()
  }
  return ''
}

// ── Loop Groq (function calling estilo OpenAI) ───────────────────────────────
async function runGroqChat(apiKey: string, system: string, neutral: { role: string; content: string }[], ctx: ToolCtx): Promise<string> {
  const msgs: any[] = [{ role: 'system', content: system }, ...neutral.map(m => ({ role: m.role, content: m.content }))]
  const oaiTools = TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }))
  for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
    const resp = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: AI_PROVIDER_INFO.groq.model, max_tokens: 2048, temperature: 0.3,
        messages: msgs, tools: oaiTools, tool_choice: 'auto',
      }),
    })
    if (!resp.ok) throw new Error(`Groq ${resp.status}: ${await resp.text()}`)
    const data = await resp.json()
    const choice = data.choices?.[0]
    const msg = choice?.message
    if (!msg) return ''
    msgs.push(msg)
    if (choice.finish_reason === 'tool_calls' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        const result = await executeTool(ctx, tc.function?.name, tc.function?.arguments)
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
      continue
    }
    return String(msg.content ?? '').trim()
  }
  return ''
}

/**
 * Envia a conversa (histórico + última pergunta do usuário) e devolve a resposta do
 * CFO. `history` termina no turn 'user' mais recente. Aplica o limite diário ANTES de
 * chamar a IA; ao bater o limite, retorna limitReached=true sem chamar nada.
 */
export async function sendCfoMessage(params: {
  userId: string
  plan: Plan
  cycleStart: number
  history: ChatTurn[]
}): Promise<{ reply: string; limitReached: boolean }> {
  const count = await getCfoChatCount()
  if (!isWithinDailyLimit(count, params.plan)) return { reply: '', limitReached: true }

  const provider = getAIProvider(params.plan)
  const apiKey = getApiKey(provider)
  if (!apiKey) throw new Error(`Chave da API ${provider} não configurada.`)

  const ctx: ToolCtx = { userId: params.userId, cycleStart: params.cycleStart }
  const neutral = params.history.map(t => ({ role: t.role, content: t.text }))

  const reply = provider === 'claude'
    ? await runClaudeChat(apiKey, CFO_SYSTEM_PROMPT, neutral, ctx)
    : await runGroqChat(apiKey, CFO_SYSTEM_PROMPT, neutral, ctx)

  await incrementCfoChatCount()  // só conta quando a IA respondeu de fato
  return { reply: reply || 'Não consegui gerar uma resposta agora. Tente reformular a pergunta.', limitReached: false }
}
