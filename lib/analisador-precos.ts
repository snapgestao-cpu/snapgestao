import { supabase } from './supabase'
import { getMesesValidos } from './getMesesValidos'

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
  }
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || ''
  if (!apiKey) throw new Error('Configure EXPO_PUBLIC_ANTHROPIC_API_KEY no .env')

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

  const prompt = `Você é um especialista em análise de preços e comportamento de consumo brasileiro.

Analise estes dados de compras dos últimos meses e retorne APENAS um JSON válido e completo.
Não escreva nada antes ou depois do JSON.

DADOS DE COMPRAS:
${JSON.stringify(itensRelevantes, null, 2)}

PREFERÊNCIAS DO USUÁRIO:
- Pote analisado: ${questionario.pote || 'Todos'}
- Preocupação: ${questionario.preocupacao.opcao || 'geral'}${questionario.preocupacao.comentario ? ' — ' + questionario.preocupacao.comentario : ''}
- Foco: ${questionario.foco.opcao || 'análise completa'}${questionario.foco.comentario ? ' — ' + questionario.foco.comentario : ''}

INSTRUÇÕES:
1. Agrupe itens similares com nomes diferentes (ex: "almoço", "almoco", "ALMOCO" = mesmo item)
2. Para cada estabelecimento calcule min, média e max dos preços reais
3. Identifique tendência de preço: "subindo", "descendo" ou "estavel"
4. Calcule economia mensal potencial (diferença entre mais caro e mais barato multiplicado pela frequência mensal)
5. Máximo 10 itens no resultado
6. Máximo 4 estabelecimentos por item
7. Priorize itens com maior variação de preço

RETORNE EXATAMENTE este JSON completo:
{
  "itens": [
    {
      "descricao": "nome normalizado",
      "categoria": "categoria do produto",
      "estabelecimentos": [
        {
          "nome": "nome do estabelecimento",
          "preco_minimo": 0.00,
          "preco_medio": 0.00,
          "preco_maximo": 0.00,
          "vezes": 0,
          "tendencia": "estavel"
        }
      ],
      "melhor_opcao": "estabelecimento mais barato",
      "pior_opcao": "estabelecimento mais caro",
      "economia_mensal_potencial": 0.00,
      "insight": "observação específica e útil"
    }
  ],
  "resumo": {
    "total_itens_analisados": 0,
    "economia_total_potencial": 0.00,
    "estabelecimento_mais_barato": "nome",
    "estabelecimento_mais_caro": "nome",
    "recomendacao_principal": "recomendação prática"
  }
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('[Analisador] API error:', err)
    throw new Error('Erro na API de análise. Tente novamente.')
  }

  const data = await response.json()
  const rawText = data.content?.[0]?.text || ''

  console.log('[Analisador] Response length:', rawText.length)

  if (!rawText.trim()) {
    throw new Error('Resposta vazia. Tente novamente.')
  }

  let clean = rawText.trim()
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  }

  try {
    const parsed = JSON.parse(clean)
    console.log('[Analisador] Itens analisados:', parsed.itens?.length || 0)
    return JSON.stringify(parsed)
  } catch (err) {
    console.error('[Analisador] Parse error:', err)
    console.error('[Analisador] Text:', clean.substring(0, 300))
    throw new Error('Erro ao processar análise. Tente novamente.')
  }
}
