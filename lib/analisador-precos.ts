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

async function analisarBatch(itens: any[], apiKey: string): Promise<any[]> {
  const prompt = `Analise estes dados de compras e retorne APENAS JSON válido e completo.
Sem texto antes ou depois do JSON.

DADOS:
${JSON.stringify(itens, null, 2)}

Retorne este JSON COMPLETO (obrigatório fechar todas as chaves e colchetes):
[
  {
    "descricao": "nome normalizado do produto",
    "categoria": "categoria",
    "estabelecimentos": [
      {
        "nome": "nome do local",
        "preco_minimo": 0.00,
        "preco_medio": 0.00,
        "preco_maximo": 0.00,
        "vezes": 0,
        "tendencia": "estavel"
      }
    ],
    "melhor_opcao": "mais barato",
    "pior_opcao": "mais caro",
    "economia_mensal_potencial": 0.00,
    "insight": "dica curta"
  }
]

REGRAS:
- Máximo 3 estabelecimentos por item
- tendencia: "subindo", "descendo" ou "estavel"
- JSON deve estar 100% completo e fechado
- Retornar ARRAY mesmo que seja 1 item`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    throw new Error('Erro Gemini: ' + await response.text())
  }

  const data = await response.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  console.log('[Batch] length:', rawText.length)

  if (!rawText.trim()) {
    console.warn('[Batch] Resposta vazia, pulando')
    return []
  }

  let clean = rawText.trim()
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  }

  try {
    const parsed = JSON.parse(clean)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (err) {
    console.error('[Batch] Parse error:', err)
    console.error('[Batch] Text:', clean.substring(0, 300))
    return []
  }
}

async function gerarResumo(itens: any[]): Promise<any> {
  const ecoTotal = itens.reduce((s, i) => s + (i.economia_mensal_potencial || 0), 0)

  const mediasPorEstab: Record<string, number[]> = {}
  itens.flatMap(i => i.estabelecimentos || []).forEach(e => {
    if (!mediasPorEstab[e.nome]) mediasPorEstab[e.nome] = []
    mediasPorEstab[e.nome].push(e.preco_medio || 0)
  })

  const mediasGlobais = Object.entries(mediasPorEstab)
    .map(([nome, precos]) => ({ nome, media: precos.reduce((s, v) => s + v, 0) / precos.length }))
    .sort((a, b) => a.media - b.media)

  return {
    total_itens_analisados: itens.length,
    economia_total_potencial: ecoTotal,
    estabelecimento_mais_barato: mediasGlobais[0]?.nome || '',
    estabelecimento_mais_caro: mediasGlobais[mediasGlobais.length - 1]?.nome || '',
    recomendacao_principal: ecoTotal > 0
      ? `Você pode economizar até R$ ${ecoTotal.toFixed(2)} por mês comprando nos estabelecimentos mais baratos.`
      : 'Continue monitorando seus gastos!',
  }
}

export async function analisarPrecos(
  transactions: any[],
  questionario: {
    pote: string | null
    preocupacao: { opcao: string | null; comentario: string }
    foco: { opcao: string | null; comentario: string }
  }
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || ''
  if (!apiKey) throw new Error('Configure EXPO_PUBLIC_GEMINI_API_KEY no .env')

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
    .slice(0, 12)

  console.log('[Analisador] Total transactions:', transactions.length)
  console.log('[Analisador] Itens para análise:', itensRelevantes.length)

  if (itensRelevantes.length === 0) {
    throw new Error(
      'Não encontrei itens comprados 3 ou mais vezes. Continue registrando seus gastos!'
    )
  }

  const BATCH_SIZE = 3
  const batches: any[][] = []
  for (let i = 0; i < itensRelevantes.length; i += BATCH_SIZE) {
    batches.push(itensRelevantes.slice(i, i + BATCH_SIZE))
  }

  console.log('[Analisador] Batches:', batches.length)

  const todosItens: any[] = []
  for (let i = 0; i < batches.length; i++) {
    console.log(`[Analisador] Processando batch ${i + 1}/${batches.length}...`)
    try {
      const itensDoBackh = await analisarBatch(batches[i], apiKey)
      todosItens.push(...itensDoBackh)
      if (i < batches.length - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (err) {
      console.error(`[Analisador] Batch ${i + 1} falhou:`, err)
    }
  }

  if (todosItens.length === 0) {
    throw new Error('Não foi possível analisar os dados. Tente novamente.')
  }

  const resumo = await gerarResumo(todosItens)

  console.log('[Analisador] Total itens analisados:', todosItens.length)

  return JSON.stringify({ itens: todosItens, resumo })
}
