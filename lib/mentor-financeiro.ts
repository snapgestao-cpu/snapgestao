import { supabase } from './supabase'
import { getCycle } from './cycle'
import { AIProvider, callAI } from './ai-provider'

export type QuestionarioRespostas = {
  objetivo: { opcao: string | null; comentario: string }
  dificuldade: { opcao: string | null; comentario: string }
  metaPrincipal: { opcao: string | null; comentario: string }
  prazo: { opcao: string | null; comentario: string }
  tom: { opcao: string | null; comentario: string }
  periodo: { opcao: string | null; comentario: string }
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
  periodoAnalisado: { meses: number; descricao: string; ciclosIncluidos: number }
}

export function getMesesParaAnalisar(opcao: string | null): number {
  switch (opcao) {
    case '1mes':   return 1
    case '3meses': return 3
    case '6meses': return 6
    case 'tudo':   return 24
    default:       return 3
  }
}

function periodoDescricao(maxMeses: number): string {
  if (maxMeses === 1) return 'Último mês'
  if (maxMeses === 3) return 'Últimos 3 meses'
  if (maxMeses === 6) return 'Últimos 6 meses'
  return 'Todo o histórico disponível'
}

async function buscarMesesValidos(
  userId: string,
  cycleStart: number,
  maxMeses: number
): Promise<{ start: string; end: string }[]> {
  const mesesValidos: { start: string; end: string }[] = []

  const { start: cs, end: ce } = getCycle(cycleStart, 0)
  mesesValidos.push({
    start: cs.toISOString().split('T')[0],
    end: ce.toISOString().split('T')[0],
  })

  for (let offset = -1; offset >= -maxMeses; offset--) {
    const cycle = getCycle(cycleStart, offset)
    const startStr = cycle.start.toISOString().split('T')[0]
    const { data: rollover } = await supabase
      .from('cycle_rollovers')
      .select('processed')
      .eq('user_id', userId)
      .eq('cycle_start_date', startStr)
      .maybeSingle()
    if (rollover?.processed === true) {
      mesesValidos.push({
        start: startStr,
        end: cycle.end.toISOString().split('T')[0],
      })
    }
  }

  return mesesValidos
}

const MENTOR_SYSTEM_PROMPT = `Você é o Mentor Financeiro do SnapGestão, um assistente especializado em finanças pessoais com tom amigável, direto e motivador. Responda sempre em português brasileiro.

Analise os dados financeiros e o questionário do usuário e gere um relatório completo com:

1. **Diagnóstico Financeiro** — Resumo da situação atual com base nos dados reais
2. **Pontos Fortes** — 2-3 comportamentos positivos identificados nos dados
3. **Alertas** — 2-3 pontos de atenção baseados nos gastos/hábitos
4. **Plano de Ação** — 5 recomendações específicas e práticas (numeradas)
5. **Meta 90 dias** — Uma meta concreta e mensurável para os próximos 3 meses

Seja específico, use os valores reais do usuário. Evite conselhos genéricos.`

export async function coletarContextoFinanceiro(
  userId: string,
  cycleStart: number,
  maxMeses = 3
): Promise<ContextoFinanceiro> {
  const cycle = getCycle(cycleStart, 0)
  const cycleStartISO = cycle.start.toISOString().split('T')[0]
  const cycleEndISO = cycle.end.toISOString().split('T')[0]

  const mesesValidos = await buscarMesesValidos(userId, cycleStart, maxMeses)
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
    periodoAnalisado: {
      meses: maxMeses,
      descricao: periodoDescricao(maxMeses),
      ciclosIncluidos: mesesValidos.length,
    },
  }
}

function resolveField(
  field: { opcao: string | null; comentario: string },
  map: Record<string, string>,
  fallback = '(não informado)'
): string {
  const label = field.opcao ? (map[field.opcao] ?? field.opcao) : fallback
  return field.comentario ? `${label} — comentário: "${field.comentario}"` : label
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
  const periodoMap: Record<string, string> = {
    '1mes': 'Último mês',
    '3meses': 'Últimos 3 meses',
    '6meses': 'Últimos 6 meses',
    tudo: 'Todo o histórico disponível',
  }

  const potLines = ctx.potes.map(p => {
    const limit = p.limit_amount ? `R$ ${p.limit_amount.toFixed(2)}` : 'sem limite'
    const pct = p.limit_amount ? Math.round((p.spent / p.limit_amount) * 100) : null
    return `  - ${p.name}: gasto R$ ${p.spent.toFixed(2)} / limite ${limit}${pct !== null ? ` (${pct}%)` : ''}`
  }).join('\n')

  const merchantLines = ctx.topMerchants.map(m =>
    `  - ${m.name}: R$ ${m.total.toFixed(2)}`
  ).join('\n')

  return `PERÍODO ANALISADO: ${ctx.periodoAnalisado.descricao} (${ctx.periodoAnalisado.ciclosIncluidos} ciclos fechados + mês atual)
Ciclos incluídos: ${ctx.periodoAnalise}
Considere APENAS estes meses na sua análise.

QUESTIONÁRIO DO USUÁRIO:
- Objetivo principal: ${resolveField(respostas.objetivo, objetivoMap)}
- Maior dificuldade: ${resolveField(respostas.dificuldade, dificuldadeMap)}
- Meta principal: ${resolveField(respostas.metaPrincipal, {}, '(não informada)')}
- Prazo: ${resolveField(respostas.prazo, prazoMap)}
- Tom preferido: ${resolveField(respostas.tom, tomMap)}
- Período escolhido: ${resolveField(respostas.periodo, periodoMap)}

DADOS FINANCEIROS REAIS (ciclo atual):
- Receita mensal total: R$ ${ctx.totalReceita.toFixed(2)}
- Total gasto no ciclo atual: R$ ${ctx.totalGasto.toFixed(2)}
- Poupança estimada: R$ ${ctx.totalPoupado.toFixed(2)}
- Taxa de poupança: ${ctx.totalReceita > 0 ? Math.round((ctx.totalPoupado / ctx.totalReceita) * 100) : 0}%
- Metas ativas: ${ctx.metasAtivas}

POTES (orçamento por categoria):
${potLines || '  (nenhum pote cadastrado)'}

TOP ESTABELECIMENTOS (período analisado):
${merchantLines || '  (sem dados)'}

Gere o relatório completo do Mentor Financeiro.`
}

export async function gerarRelatorioMentor(
  respostas: QuestionarioRespostas,
  ctx: ContextoFinanceiro,
  provider: AIProvider = 'gemini'
): Promise<string> {
  const promptUsuario = buildPrompt(respostas, ctx)

  const promptForcado = `INSTRUÇÕES CRÍTICAS:
- Fale SEMPRE em segunda pessoa ("você", "seu")
- NUNCA use "o usuário" ou terceira pessoa
- Seja DIRETO e ESPECÍFICO com valores reais em R$
- Dê ações CONCRETAS com números exatos
- Tom: consultor financeiro pessoal, não relatório
- Use emojis para destacar pontos importantes
- Máximo 3 itens por seção — foco é essencial

${promptUsuario}`

  const finalPrompt = provider === 'claude' ? promptUsuario : promptForcado

  const text = await callAI(provider, finalPrompt, MENTOR_SYSTEM_PROMPT)
  if (!text.trim()) throw new Error('Resposta vazia da IA')
  return text
}
