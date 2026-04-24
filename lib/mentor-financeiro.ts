import { supabase } from './supabase'
import { getCycle } from './cycle'

export type QuestionarioRespostas = {
  objetivo: string        // 'economizar' | 'quitar_dividas' | 'investir' | 'controlar'
  rendaMensal: string     // 'ate_3k' | '3k_7k' | '7k_15k' | 'acima_15k'
  maiorDesafio: string    // 'impulso' | 'fixos_altos' | 'sem_reserva' | 'dividas'
  temReserva: string      // 'sim' | 'nao' | 'pouco'
  prioridade: string      // 'seguranca' | 'qualidade_vida' | 'patrimonio' | 'liberdade'
}

export type ContextoFinanceiro = {
  potes: { name: string; limit_amount: number | null; spent: number }[]
  totalReceita: number
  totalGasto: number
  totalPoupado: number
  mesesAnalisados: number
  topMerchants: { name: string; total: number }[]
  metasAtivas: number
  cicloStart: number
}

const MENTOR_SYSTEM_PROMPT = `Você é o Mentor Financeiro do SnapGestão, um assistente especializado em finanças pessoais com tom amigável, direto e motivador. Responda sempre em português brasileiro.

Analise os dados financeiros e o questionário do usuário e gere um relatório completo com:

1. **Diagnóstico Financeiro** — Resumo da situação atual com base nos dados reais
2. **Pontos Fortes** — 2-3 comportamentos positivos identificados nos dados
3. **Alertas** — 2-3 pontos de atenção baseados nos gastos/hábitos
4. **Plano de Ação** — 5 recomendações específicas e práticas (numeradas)
5. **Meta 90 dias** — Uma meta concreta e mensurável para os próximos 3 meses

Seja específico, use os valores reais do usuário. Evite conselhos genéricos. Máximo 600 palavras no total.`

export async function coletarContextoFinanceiro(userId: string, cycleStart: number): Promise<ContextoFinanceiro> {
  const cycle = getCycle(cycleStart, 0)
  const cycleStartISO = cycle.start.toISOString().split('T')[0]
  const cycleEndISO = cycle.end.toISOString().split('T')[0]

  const [
    { data: pots },
    { data: incomeSources },
    { data: txsThisCycle },
    { data: txs3Months },
    { data: goals },
  ] = await Promise.all([
    supabase.from('pots').select('id, name, limit_amount').eq('user_id', userId).is('deleted_at', null),
    supabase.from('income_sources').select('amount').eq('user_id', userId),
    supabase.from('transactions')
      .select('type, amount, merchant, pot_id')
      .eq('user_id', userId)
      .in('type', ['expense', 'goal_deposit'])
      .gte('date', cycleStartISO)
      .lte('date', cycleEndISO),
    supabase.from('transactions')
      .select('type, amount, merchant, date')
      .eq('user_id', userId)
      .gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: false }),
    supabase.from('goals').select('id').eq('user_id', userId),
  ])

  const totalReceita = ((incomeSources ?? []) as any[]).reduce((s: number, r: any) => s + Number(r.amount), 0)
  const expenses = (txsThisCycle ?? []) as any[]
  const totalGasto = expenses.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0)
  const totalPoupado = (txs3Months ?? []) as any[]

  // Spent per pot this cycle
  const spentByPot: Record<string, number> = {}
  expenses.forEach((t: any) => {
    if (t.pot_id && t.type === 'expense') {
      spentByPot[t.pot_id] = (spentByPot[t.pot_id] ?? 0) + Number(t.amount)
    }
  })

  const potesComGasto = ((pots ?? []) as any[]).map((p: any) => ({
    name: p.name,
    limit_amount: p.limit_amount ? Number(p.limit_amount) : null,
    spent: spentByPot[p.id] ?? 0,
  }))

  // Top merchants last 90 days
  const merchantMap: Record<string, number> = {}
  ;((txs3Months ?? []) as any[])
    .filter((t: any) => t.type === 'expense' && t.merchant)
    .forEach((t: any) => {
      merchantMap[t.merchant] = (merchantMap[t.merchant] ?? 0) + Number(t.amount)
    })
  const topMerchants = Object.entries(merchantMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }))

  return {
    potes: potesComGasto,
    totalReceita,
    totalGasto,
    totalPoupado: Math.max(totalReceita - totalGasto, 0),
    mesesAnalisados: 3,
    topMerchants,
    metasAtivas: (goals ?? []).length,
    cicloStart: cycleStart,
  }
}

function buildPrompt(respostas: QuestionarioRespostas, ctx: ContextoFinanceiro): string {
  const objetivoMap: Record<string, string> = {
    economizar: 'Economizar mais dinheiro',
    quitar_dividas: 'Quitar dívidas',
    investir: 'Começar a investir',
    controlar: 'Ter controle financeiro',
  }
  const rendaMap: Record<string, string> = {
    ate_3k: 'até R$ 3.000',
    '3k_7k': 'R$ 3.000 a R$ 7.000',
    '7k_15k': 'R$ 7.000 a R$ 15.000',
    acima_15k: 'acima de R$ 15.000',
  }
  const desafioMap: Record<string, string> = {
    impulso: 'Gastos por impulso',
    fixos_altos: 'Gastos fixos muito altos',
    sem_reserva: 'Falta de reserva de emergência',
    dividas: 'Dívidas acumuladas',
  }
  const reservaMap: Record<string, string> = {
    sim: 'Sim, tenho reserva de emergência',
    nao: 'Não tenho reserva',
    pouco: 'Tenho pouco (menos de 3 meses)',
  }
  const prioridadeMap: Record<string, string> = {
    seguranca: 'Segurança financeira',
    qualidade_vida: 'Qualidade de vida',
    patrimonio: 'Construir patrimônio',
    liberdade: 'Liberdade financeira',
  }

  const potLines = ctx.potes.map(p => {
    const limit = p.limit_amount ? `R$ ${p.limit_amount.toFixed(2)}` : 'sem limite'
    const pct = p.limit_amount ? Math.round((p.spent / p.limit_amount) * 100) : null
    return `  - ${p.name}: gasto R$ ${p.spent.toFixed(2)} / limite ${limit}${pct !== null ? ` (${pct}%)` : ''}`
  }).join('\n')

  const merchantLines = ctx.topMerchants.map(m =>
    `  - ${m.name}: R$ ${m.total.toFixed(2)}`
  ).join('\n')

  return `QUESTIONÁRIO DO USUÁRIO:
- Objetivo principal: ${objetivoMap[respostas.objetivo] ?? respostas.objetivo}
- Faixa de renda mensal: ${rendaMap[respostas.rendaMensal] ?? respostas.rendaMensal}
- Maior desafio financeiro: ${desafioMap[respostas.maiorDesafio] ?? respostas.maiorDesafio}
- Reserva de emergência: ${reservaMap[respostas.temReserva] ?? respostas.temReserva}
- Prioridade de vida: ${prioridadeMap[respostas.prioridade] ?? respostas.prioridade}

DADOS FINANCEIROS REAIS (ciclo atual):
- Receita mensal total: R$ ${ctx.totalReceita.toFixed(2)}
- Total gasto no ciclo atual: R$ ${ctx.totalGasto.toFixed(2)}
- Poupança estimada: R$ ${ctx.totalPoupado.toFixed(2)}
- Taxa de poupança: ${ctx.totalReceita > 0 ? Math.round((ctx.totalPoupado / ctx.totalReceita) * 100) : 0}%
- Metas ativas: ${ctx.metasAtivas}

POTES (orçamento por categoria):
${potLines || '  (nenhum pote cadastrado)'}

TOP ESTABELECIMENTOS (últimos 90 dias):
${merchantLines || '  (sem dados)'}

Gere o relatório completo do Mentor Financeiro.`
}

export async function gerarRelatorioMentor(
  respostas: QuestionarioRespostas,
  ctx: ContextoFinanceiro
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
  if (!apiKey) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY não configurada')

  const prompt = buildPrompt(respostas, ctx)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: MENTOR_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 200)}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Resposta vazia da IA')
  return text
}
