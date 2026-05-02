import { supabase } from './supabase'
import { getMesesValidos } from './getMesesValidos'
import { AIProvider, callAI } from './ai-provider'
import { getPriceComparison, getUserCity } from './price-database'

export type ItemPreco = {
  descricao: string
  estabelecimentos: Array<{
    nome: string
    preco_minimo: number
    preco_medio: number
    preco_maximo: number
    vezes: number
    datas: string[]
  }>
  melhor_opcao: string
  pior_opcao: string
  economia_potencial: number
}

export type AnalisePrecos = {
  itens: ItemPreco[]
  total_transacoes_analisadas: number
  periodo: string
  insights: string
  top_economia: string
}

export async function buscarDadosParaAnalise(
  userId: string,
  potId: string | null,
  cycleStart: number
): Promise<any[]> {
  const mesesValidos = await getMesesValidos(userId, cycleStart)
  const allTransactions: any[] = []

  for (const mes of mesesValidos) {
    let query = supabase
      .from('transactions')
      .select('description, merchant, amount, date, pot_id, pots(name)')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('date', mes.start)
      .lte('date', mes.end)
      .not('description', 'is', null)
      .not('merchant', 'is', null)

    if (potId) {
      query = query.eq('pot_id', potId)
    }

    const { data } = await query
    allTransactions.push(...(data ?? []))
  }

  return allTransactions
}

export async function analisarPrecos(
  transactions: any[],
  questionario: {
    pote: string | null
    preocupacao: { opcao: string | null; comentario: string }
    foco: { opcao: string | null; comentario: string }
  },
  provider: AIProvider = 'claude',
  userId?: string
): Promise<string> {

  const grupos: Record<string, any[]> = {}
  transactions.forEach(t => {
    const chave = (t.description || '').toLowerCase().trim()
    if (!chave) return
    if (!grupos[chave]) grupos[chave] = []
    grupos[chave].push(t)
  })

  const itensRelevantes = Object.entries(grupos)
    .filter(([, items]) => items.length >= 3)
    .map(([desc, items]) => ({
      descricao: desc,
      ocorrencias: items.length,
      transacoes: items.map(t => ({
        valor: Number(t.amount),
        estabelecimento: t.merchant,
        mes: (t.date || '').substring(0, 7),
      })),
    }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, 15)

  console.log('[Analisador] Total transactions:', transactions.length)
  console.log('[Analisador] Itens para análise:', itensRelevantes.length)

  if (itensRelevantes.length === 0) {
    throw new Error(
      'Não encontrei itens comprados 3 ou mais vezes. Continue registrando seus gastos!'
    )
  }

  // Dados colaborativos: buscar comparativo para top 5 itens (silencioso se falhar)
  let dadosColaborativos = ''
  if (userId) {
    try {
      const userCity = await getUserCity(userId)
      const comparativos = await Promise.all(
        itensRelevantes.slice(0, 5).map(async item => {
          const comparacao = await getPriceComparison(item.descricao, userCity)
          return { item: item.descricao, comparacao: comparacao.slice(0, 3) }
        })
      )
      const comparativoText = comparativos
        .filter(c => c.comparacao.length >= 2)
        .map(c => {
          const precos = c.comparacao.map(e =>
            `${e.establishment}: min R$${e.min_price.toFixed(2)} / med R$${e.avg_price.toFixed(2)}`
          ).join(', ')
          return `${c.item}: ${precos}`
        }).join('\n')

      if (comparativoText) {
        dadosColaborativos = `\nDADOS DA COMUNIDADE (últimos 30 dias — preços de outros usuários):\n${comparativoText}`
      }
    } catch {
      // Dados colaborativos são opcionais — não bloquear análise
    }
  }

  const prompt = `Você é um especialista em análise de preços e comportamento de consumo brasileiro.
Analise os dados de compras abaixo e gere um relatório detalhado em português.

DADOS DE COMPRAS (últimos meses):
${JSON.stringify(itensRelevantes, null, 2)}${dadosColaborativos}

PREFERÊNCIAS DO USUÁRIO:
- Pote analisado: ${questionario.pote || 'Todos'}
- Principal preocupação: ${questionario.preocupacao.opcao || 'geral'}${questionario.preocupacao.comentario ? ' — ' + questionario.preocupacao.comentario : ''}
- Foco da análise: ${questionario.foco.opcao || 'análise completa'}${questionario.foco.comentario ? ' — ' + questionario.foco.comentario : ''}

Gere um relatório com estas seções usando emojis.
Seja específico com valores reais em R$.
Máximo 3 estabelecimentos por item analisado.

## 🔍 Resumo Geral
Visão geral dos padrões de compra identificados.
Quantos itens foram analisados e o potencial total de economia mensal.

## 📊 Análise por Item
Para cada item com variação significativa de preço:

**[emoji] [Nome do Item]**
Onde você compra e quanto paga em cada lugar.
Qual o mais barato e o mais caro.
Quanto economizaria por mês comprando sempre no mais barato.
Tendência de preço (subindo/descendo/estável).

## 🏪 Estabelecimentos
Quais estabelecimentos têm os melhores e piores preços no geral.
Onde você vai com mais frequência e se está fazendo boas escolhas.

## 💡 Oportunidades de Economia
Top 3 mudanças de comportamento que gerariam maior economia mensal.
Seja específico: "Trocando X por Y você economizaria R$ Z por mês".

## 🎯 Recomendação Principal
Uma ação específica e imediata que o usuário deve tomar baseada nos dados analisados.

Use linguagem amigável e motivadora.
Cite sempre valores reais dos dados.`

  const relatorio = await callAI(provider, prompt)

  console.log('[Analisador] Relatório gerado:', relatorio.length, 'chars')

  if (!relatorio.trim()) throw new Error('Resposta vazia. Tente novamente.')

  return relatorio
}
