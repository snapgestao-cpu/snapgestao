/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Mentor Financeiro com IA — coleta dados do usuário (potes,
 * receitas, gastos, metas, reserva) e gera diagnóstico
 * personalizado com alertas e plano de ação em Markdown,
 * exportável como PDF.
 */

import { supabase } from './supabase'
import { getCycle } from './cycle'
import { AIProvider, callAI } from './ai-provider'
import { getIncomeSourcesForMonth } from './income-history'

export type QuestionarioRespostas = {
  objetivo: { opcao: string | null; comentario: string }
  dificuldade: { opcao: string | null; comentario: string }
  metaPrincipal: { opcao: string | null; comentario: string }
  prazo: { opcao: string | null; comentario: string }
  tom: { opcao: string | null; comentario: string }
  periodo: { opcao: string | null; comentario: string }
  mesesFuturos: { opcao: string | null; comentario: string }
  observacaoFinal: { opcao: string | null; comentario: string }
}

export type ReceitaMes = {
  label: string      // ex: "Jun/2026"
  cycleStart: string // ISO date
  receitaRecorrente: number
  receitaAvulsa: number
  total: number
  futuro: boolean
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
  receitasPorMes: ReceitaMes[]   // histórico + meses futuros
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

export function getMesesFuturos(opcao: string | null): number {
  switch (opcao) {
    case '0':  return 0
    case '1':  return 1
    case '3':  return 3
    case '6':  return 6
    case '12': return 12
    default:   return 3
  }
}

function periodoDescricao(maxMeses: number): string {
  if (maxMeses === 1) return 'Último mês'
  if (maxMeses === 3) return 'Últimos 3 meses'
  if (maxMeses === 6) return 'Últimos 6 meses'
  return 'Todo o histórico disponível'
}

function cycleLabel(startISO: string): string {
  const [year, month] = startISO.split('-')
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${MONTHS[parseInt(month) - 1]}/${year}`
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

REGRAS IMPORTANTES:
- Quando o usuário deixar comentários ou observações nas perguntas, interprete-os como contexto essencial e adapte o diagnóstico com base neles — eles revelam intenções, situações específicas e prioridades que os dados financeiros sozinhos não mostram.
- Se houver uma observação final do usuário, ela deve ser levada em conta com prioridade máxima — pode mudar completamente o foco do relatório.
- Quando houver receitas previstas em meses futuros, leve-as em conta no planejamento — especialmente para reservas, metas e quitação de dívidas.
- Seja específico, use os valores reais do usuário. Evite conselhos genéricos.`

export async function coletarContextoFinanceiro(
  userId: string,
  cycleStart: number,
  maxMeses = 3,
  maxMesesFuturos = 3
): Promise<ContextoFinanceiro> {
  const cycle = getCycle(cycleStart, 0)
  const cycleStartISO = cycle.start.toISOString().split('T')[0]
  const cycleEndISO = cycle.end.toISOString().split('T')[0]

  const mesesValidos = await buscarMesesValidos(userId, cycleStart, maxMeses)
  const periodoAnalise = mesesValidos.map(m => m.start.substring(0, 7)).join(', ')

  // ── Dados base ─────────────────────────────────────────────────────────────

  const [
    { data: pots },
    { data: txsThisCycle },
    { data: goals },
  ] = await Promise.all([
    supabase.from('pots').select('id, name, limit_amount').eq('user_id', userId).is('deleted_at', null),
    supabase.from('transactions')
      .select('type, amount, merchant, pot_id')
      .eq('user_id', userId)
      .in('type', ['expense', 'goal_deposit'])
      .gte('date', cycleStartISO)
      .lte('date', cycleEndISO),
    supabase.from('goals').select('id').eq('user_id', userId),
  ])

  // ── Top merchants (todos os meses válidos — única query por range) ────────────

  const oldestMes = mesesValidos[mesesValidos.length - 1]
  const newestMes = mesesValidos[0]
  const { data: allTxsMerchant } = await supabase
    .from('transactions')
    .select('type, amount, merchant')
    .eq('user_id', userId)
    .in('type', ['expense', 'goal_deposit'])
    .gte('date', oldestMes.start)
    .lte('date', newestMes.end)

  // ── Receitas por mês: histórico + 3 meses futuros ──────────────────────────

  // Todos os offsets a coletar: mesesValidos (passado/atual) + até +3 futuros
  const receitasPorMes: ReceitaMes[] = []

  // Histórico + atual (offsets <= 0)
  for (const mes of mesesValidos) {
    const [incomeSources, { data: avulsas }] = await Promise.all([
      getIncomeSourcesForMonth(userId, cycleStart, offsetFromISO(mes.start, cycleStart)),
      supabase.from('transactions')
        .select('amount')
        .eq('user_id', userId)
        .eq('type', 'income')
        .gte('date', mes.start)
        .lte('date', mes.end),
    ])
    const recorrente = incomeSources.reduce((s, r) => s + r.amount, 0)
    const avulsa = (avulsas ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
    receitasPorMes.push({
      label: cycleLabel(mes.start),
      cycleStart: mes.start,
      receitaRecorrente: recorrente,
      receitaAvulsa: avulsa,
      total: recorrente + avulsa,
      futuro: false,
    })
  }

  // Meses futuros: configurável pelo usuário
  for (let offset = 1; offset <= maxMesesFuturos; offset++) {
    const futureCycle = getCycle(cycleStart, offset)
    const futureStart = futureCycle.start.toISOString().split('T')[0]
    const futureEnd = futureCycle.end.toISOString().split('T')[0]
    const [incomeSources, { data: avulsas }] = await Promise.all([
      getIncomeSourcesForMonth(userId, cycleStart, offset),
      supabase.from('transactions')
        .select('amount')
        .eq('user_id', userId)
        .eq('type', 'income')
        .gte('date', futureStart)
        .lte('date', futureEnd),
    ])
    const recorrente = incomeSources.reduce((s, r) => s + r.amount, 0)
    const avulsa = (avulsas ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
    // Só inclui se há algum dado (não queremos poluir o contexto com zeros)
    if (recorrente > 0 || avulsa > 0) {
      receitasPorMes.push({
        label: cycleLabel(futureStart),
        cycleStart: futureStart,
        receitaRecorrente: recorrente,
        receitaAvulsa: avulsa,
        total: recorrente + avulsa,
        futuro: true,
      })
    }
  }

  // ── Cálculos do ciclo atual ─────────────────────────────────────────────────

  const atualMes = receitasPorMes.find(m => m.cycleStart === cycleStartISO)
  const totalReceita = atualMes?.total ?? 0

  const expenses = (txsThisCycle ?? []) as any[]
  const totalGasto = expenses
    .filter((t: any) => t.type === 'expense')
    .reduce((s: number, t: any) => s + Number(t.amount), 0)

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

  const merchantMap: Record<string, number> = {};
  (allTxsMerchant ?? [])
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
    receitasPorMes,
  }
}

// Calcula o offset de um ciclo a partir do seu startISO
function offsetFromISO(startISO: string, cycleStart: number): number {
  const cycle0 = getCycle(cycleStart, 0)
  const startDate = new Date(startISO)
  const base = cycle0.start
  const diffMonths =
    (startDate.getFullYear() - base.getFullYear()) * 12 +
    (startDate.getMonth() - base.getMonth())
  return diffMonths
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
  const mesesFuturosMap: Record<string, string> = {
    '0':  'Não analisar meses futuros',
    '1':  '1 mês futuro',
    '3':  '3 meses futuros',
    '6':  '6 meses futuros',
    '12': '12 meses futuros',
  }

  const potLines = ctx.potes.map(p => {
    const limit = p.limit_amount ? `R$ ${p.limit_amount.toFixed(2)}` : 'sem limite'
    const pct = p.limit_amount ? Math.round((p.spent / p.limit_amount) * 100) : null
    return `  - ${p.name}: gasto R$ ${p.spent.toFixed(2)} / limite ${limit}${pct !== null ? ` (${pct}%)` : ''}`
  }).join('\n')

  const merchantLines = ctx.topMerchants.map(m =>
    `  - ${m.name}: R$ ${m.total.toFixed(2)}`
  ).join('\n')

  // Seção de receitas por mês (histórico)
  const historicoMeses = ctx.receitasPorMes.filter(m => !m.futuro)
  const receitaHistoricoLines = historicoMeses.map(m => {
    const avulsaInfo = m.receitaAvulsa > 0 ? ` (+R$ ${m.receitaAvulsa.toFixed(2)} avulsa)` : ''
    return `  - ${m.label}: R$ ${m.receitaRecorrente.toFixed(2)} recorrente${avulsaInfo} = R$ ${m.total.toFixed(2)} total`
  }).join('\n')

  // Seção de receitas futuras previstas
  const mesesFuturos = ctx.receitasPorMes.filter(m => m.futuro)
  const receitaFuturaSection = mesesFuturos.length > 0
    ? `\nRECEITAS PREVISTAS (meses futuros — registradas no app):
${mesesFuturos.map(m => {
  const avulsaInfo = m.receitaAvulsa > 0
    ? ` (inclui R$ ${m.receitaAvulsa.toFixed(2)} em receitas avulsas/extras)`
    : ''
  return `  - ${m.label}: R$ ${m.total.toFixed(2)} total${avulsaInfo}`
}).join('\n')}
IMPORTANTE: Leve esses valores futuros em conta no planejamento — especialmente para reservas de emergência, metas de poupança e decisões de quitação de dívidas.`
    : ''

  const observacaoFinalSection = respostas.observacaoFinal.comentario.trim()
    ? `\nOBSERVAÇÃO FINAL DO USUÁRIO (leve com prioridade máxima — pode redirecionar todo o foco do relatório):
"${respostas.observacaoFinal.comentario.trim()}"
`
    : ''

  return `PERÍODO HISTÓRICO ANALISADO: ${ctx.periodoAnalisado.descricao} (${ctx.periodoAnalisado.ciclosIncluidos} ciclos fechados + mês atual)
Ciclos incluídos: ${ctx.periodoAnalise}

QUESTIONÁRIO DO USUÁRIO (comentários do usuário revelam contexto essencial — interprete-os):
- Objetivo principal: ${resolveField(respostas.objetivo, objetivoMap)}
- Maior dificuldade: ${resolveField(respostas.dificuldade, dificuldadeMap)}
- Meta principal: ${resolveField(respostas.metaPrincipal, {}, '(não informada)')}
- Prazo: ${resolveField(respostas.prazo, prazoMap)}
- Tom preferido: ${resolveField(respostas.tom, tomMap)}
- Período histórico escolhido: ${resolveField(respostas.periodo, periodoMap)}
- Meses futuros a considerar: ${resolveField(respostas.mesesFuturos, mesesFuturosMap)}
${observacaoFinalSection}

DADOS FINANCEIROS — CICLO ATUAL:
- Receita total (recorrente + avulsa): R$ ${ctx.totalReceita.toFixed(2)}
- Total gasto no ciclo atual: R$ ${ctx.totalGasto.toFixed(2)}
- Poupança estimada: R$ ${ctx.totalPoupado.toFixed(2)}
- Taxa de poupança: ${ctx.totalReceita > 0 ? Math.round((ctx.totalPoupado / ctx.totalReceita) * 100) : 0}%
- Metas ativas: ${ctx.metasAtivas}

HISTÓRICO DE RECEITAS POR MÊS:
${receitaHistoricoLines || '  (sem histórico)'}
${receitaFuturaSection}
POTES (orçamento por categoria):
${potLines || '  (nenhum pote cadastrado)'}

TOP ESTABELECIMENTOS (período analisado):
${merchantLines || '  (sem dados)'}

Gere o relatório completo do Mentor Financeiro.`
}

export async function gerarRelatorioMentor(
  respostas: QuestionarioRespostas,
  ctx: ContextoFinanceiro,
  provider: AIProvider = 'groq'
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
