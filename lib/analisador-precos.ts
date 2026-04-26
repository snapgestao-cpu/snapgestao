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

function expandirResposta(compacto: any): any {
  if (!compacto || !compacto.itens) return compacto

  return {
    itens: (compacto.itens || []).map((item: any) => ({
      descricao: item.d || item.descricao || '',
      categoria: item.cat || item.categoria || '',
      estabelecimentos: (item.est || item.estabelecimentos || []).map((e: any) => ({
        nome: e.n || e.nome || '',
        preco_minimo: e.min ?? e.preco_minimo ?? 0,
        preco_medio: e.med ?? e.preco_medio ?? 0,
        preco_maximo: e.max ?? e.preco_maximo ?? 0,
        vezes: e.v ?? e.vezes ?? 0,
        tendencia: e.t || e.tendencia || 'estavel',
      })),
      melhor_opcao: item.melhor || item.melhor_opcao || '',
      pior_opcao: item.pior || item.pior_opcao || '',
      economia_mensal_potencial: item.eco ?? item.economia_mensal_potencial ?? 0,
      insight: item.ins || item.insight || '',
    })),
    resumo: {
      total_itens_analisados:
        compacto.res?.total ?? compacto.resumo?.total_itens_analisados ?? compacto.itens?.length ?? 0,
      economia_total_potencial:
        compacto.res?.eco_total ?? compacto.resumo?.economia_total_potencial ?? 0,
      estabelecimento_mais_barato:
        compacto.res?.mais_barato || compacto.resumo?.estabelecimento_mais_barato || '',
      estabelecimento_mais_caro:
        compacto.res?.mais_caro || compacto.resumo?.estabelecimento_mais_caro || '',
      recomendacao_principal:
        compacto.res?.rec || compacto.resumo?.recomendacao_principal || '',
    },
  }
}

export async function analisarPrecos(
  transactions: any[],
  questionario: {
    pote: string | null
    preocupacao: { opcao: string | null; comentario: string }
    foco: { opcao: string | null; comentario: string }
  },
  apiKey: string
): Promise<string> {
  const grupos: Record<string, any[]> = {}
  transactions.forEach(t => {
    const chave = t.description.toLowerCase().trim()
    if (!grupos[chave]) grupos[chave] = []
    grupos[chave].push(t)
  })

  const itensRelevantes = Object.entries(grupos)
    .filter(([, items]) => items.length >= 3)
    .map(([desc, items]) => ({
      descricao: desc,
      ocorrencias: items.length,
      transacoes: items.map(t => ({
        v: Number(t.amount),
        e: t.merchant,
        d: t.date.substring(0, 7),
      })),
    }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, 10)

  console.log('[Analisador] Total transactions:', transactions.length)
  console.log('[Analisador] Itens para análise:', itensRelevantes.length)

  if (itensRelevantes.length === 0) {
    throw new Error(
      'Não encontrei itens comprados 3 ou mais vezes para comparar. Continue registrando seus gastos e tente novamente!'
    )
  }

  const prompt = `Analise preços de compras e retorne JSON compacto.

DADOS:
${JSON.stringify(itensRelevantes, null, 1)}

PREFERÊNCIAS:
Pote: ${questionario.pote || 'Todos'}
Preocupação: ${questionario.preocupacao.opcao || 'não informado'}${questionario.preocupacao.comentario ? ` — ${questionario.preocupacao.comentario}` : ''}
Foco: ${questionario.foco.opcao || 'não informado'}${questionario.foco.comentario ? ` — ${questionario.foco.comentario}` : ''}

IMPORTANTE: Retorne JSON COMPACTO e COMPLETO. Máximo 5 itens no array "itens". Priorize itens com maior variação de preço. Máximo 3 estabelecimentos por item. O JSON DEVE estar 100% completo e fechado. NÃO corte a resposta.

Retorne EXATAMENTE este JSON (sem campos extras):
{"itens":[{"d":"nome produto","cat":"categoria","est":[{"n":"estabelecimento","min":0.00,"med":0.00,"max":0.00,"v":0,"t":"estavel"}],"melhor":"mais barato","pior":"mais caro","eco":0.00,"ins":"insight curto"}],"res":{"total":0,"eco_total":0.00,"mais_barato":"nome","mais_caro":"nome","rec":"recomendação curta"}}

REGRA CRÍTICA: O JSON deve estar 100% completo com todas as chaves fechadas. Se não couber todos os itens, retorne menos itens mas o JSON DEVE estar completo e válido.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    throw new Error('Erro na API Gemini: ' + await response.text())
  }

  const data = await response.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  console.log('[Analisador] Raw response length:', rawText.length)
  console.log('[Analisador] Raw preview:', rawText.substring(0, 200))

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('Gemini retornou resposta vazia. Verifique sua API key e tente novamente.')
  }

  let cleanText = rawText.trim()
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  }

  let parsed: any
  try {
    parsed = JSON.parse(cleanText)
  } catch (parseErr) {
    console.error('[Analisador] Parse error:', parseErr)
    console.error('[Analisador] Text que falhou:', cleanText.substring(0, 500))

    const lastBrace = cleanText.lastIndexOf('}')
    if (lastBrace > 0) {
      try {
        parsed = JSON.parse(cleanText.substring(0, lastBrace + 1) + '}')
      } catch {
        throw new Error(
          'Não foi possível processar a resposta da IA. Tente novamente com menos dados ou selecione um pote específico.'
        )
      }
    } else {
      throw new Error('Resposta da IA em formato inválido. Tente novamente.')
    }
  }

  const expandido = expandirResposta(parsed)
  return JSON.stringify(expandido)
}
