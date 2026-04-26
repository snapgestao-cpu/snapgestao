import { supabase } from './supabase'
import { getCycle } from './cycle'
import { getMesesValidos } from './getMesesValidos'

export type QuestionarioRespostas = {
  objetivo: string
  dificuldade: string
  metaPrincipal: string
  prazo: string
  tom: string
  comentarios: Record<string, string>
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
  periodoAnalise: string
}

const MENTOR_SYSTEM_PROMPT = `Você é o Mentor Financeiro do SnapGestão, um assistente especializado em finanças pessoais com tom amigável, direto e motivador. Responda sempre em português brasileiro.

Analise os dados financeiros e o questionário do usuário e gere um relatório completo com:

1. **Diagnóstico Financeiro** — Resumo da situação atual com base nos dados reais
2. **Pontos Fortes** — 2-3 comportamentos positivos identificados nos dados
3. **Alertas** — 2-3 pontos de atenção baseados nos gastos/hábitos
4. **Plano de Ação** — 5 recomendações específicas e práticas (numeradas)
5. **Meta 90 dias** — Uma meta concreta e mensurável para os próximos 3 meses

Seja específico, use os valores reais do usuário. Evite conselhos genéricos.`

export async function coletarContextoFinanceiro(userId: string, cycleStart: number): Promise<ContextoFinanceiro> {
  const cycle = getCycle(cycleStart, 0)
  const cycleStartISO = cycle.start.toISOString().split('T')[0]
  const cycleEndISO = cycle.end.toISOString().split('T')[0]

  // Apenas ciclos fechados + mês atual
  const mesesValidos = await getMesesValidos(userId, cycleStart)
  const periodoAnalise = mesesValidos.map(m => m.start.substring(0, 7)).join(', ')

  const [
    { data: pots },
    { data: incomeSources },
    { data: txsThisCycle },
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
    supabase.from('goals').select('id').eq('user_id', userId),
  ])

  // Buscar transactions dos meses válidos para merchants
  const allTxsMerchant: any[] = []
  for (const mes of mesesValidos) {
    const { data } = await supabase
      .from('transactions')
      .select('type, amount, merchant')
      .eq('user_id', userId)
      .in('type', ['expense', 'goal_deposit'])
      .gte('date', mes.start)
      .lte('date', mes.end)
    allTxsMerchant.push(...(data ?? []))
  }

  const totalReceita = ((incomeSources ?? []) as any[]).reduce((s: number, r: any) => s + Number(r.amount), 0)
  const expenses = (txsThisCycle ?? []) as any[]
  const totalGasto = expenses.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0)

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

  const merchantMap: Record<string, number> = {}
  allTxsMerchant
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
    mesesAnalisados: mesesValidos.length,
    topMerchants,
    metasAtivas: (goals ?? []).length,
    cicloStart: cycleStart,
    periodoAnalise,
  }
}

function buildPrompt(respostas: QuestionarioRespostas, ctx: ContextoFinanceiro): string {
  const objetivoMap: Record<string, string> = {
    meta: 'Realizar uma meta específica',
    economizar: 'Economizar mais todo mês',
    negativo: 'Sair do saldo negativo',
    organizar: 'Organizar melhor os gastos',
    dividas: 'Quitar dívidas',
  }
  const dificuldadeMap: Record<string, string> = {
    alimentacao: 'Alimentação fora de casa',
    impulso: 'Compras por impulso',
    lazer: 'Lazer e entretenimento',
    assinaturas: 'Assinaturas e serviços',
    identificar: 'Ajuda para identificar o problema',
  }
  const prazoMap: Record<string, string> = {
    '3meses': '3 meses',
    '6meses': '6 meses',
    '1ano': '1 ano',
    'mais1ano': 'Mais de 1 ano',
  }
  const tomMap: Record<string, string> = {
    direto: 'Direto e objetivo',
    detalhado: 'Detalhado com números',
    motivador: 'Motivador e encorajador',
  }

  const withComment = (val: string, id: string) => {
    const c = respostas.comentarios[id]
    return c ? `${val} — comentário: "${c}"` : val
  }

  const potLines = ctx.potes.map(p => {
    const limit = p.limit_amount ? `R$ ${p.limit_amount.toFixed(2)}` : 'sem limite'
    const pct = p.limit_amount ? Math.round((p.spent / p.limit_amount) * 100) : null
    return `  - ${p.name}: gasto R$ ${p.spent.toFixed(2)} / limite ${limit}${pct !== null ? ` (${pct}%)` : ''}`
  }).join('\n')

  const merchantLines = ctx.topMerchants.map(m =>
    `  - ${m.name}: R$ ${m.total.toFixed(2)}`
  ).join('\n')

  return `PERÍODO ANALISADO (ciclos fechados + mês atual): ${ctx.periodoAnalise}
Considere APENAS estes meses na sua análise. Meses sem dados não foram incluídos por não terem ciclo encerrado.

QUESTIONÁRIO DO USUÁRIO:
- Objetivo principal: ${withComment(objetivoMap[respostas.objetivo] ?? respostas.objetivo, 'objetivo')}
- Maior dificuldade: ${withComment(dificuldadeMap[respostas.dificuldade] ?? respostas.dificuldade, 'dificuldade')}
- Meta principal: ${withComment(respostas.metaPrincipal || '(não informada)', 'metaPrincipal')}
- Prazo: ${withComment(prazoMap[respostas.prazo] ?? respostas.prazo, 'prazo')}
- Tom preferido: ${withComment(tomMap[respostas.tom] ?? respostas.tom, 'tom')}

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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: MENTOR_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
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
