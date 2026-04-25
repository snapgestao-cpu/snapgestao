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
  // Apenas ciclos fechados + mês atual
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
  apiKey: string
): Promise<string> {
  // Agrupar por descrição — só itens com 3+ ocorrências
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
        valor: Number(t.amount),
        estabelecimento: t.merchant,
        data: t.date,
        pote: (t.pots as any)?.name || 'Sem pote',
      })),
    }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, 30)

  const prompt = `
Você é um especialista em análise de preços e comportamento de consumo.
Analise os dados de compras abaixo e gere uma análise comparativa de preços.
Considere APENAS os dados fornecidos — são de ciclos encerrados e mês atual.

DADOS DAS COMPRAS (ciclos fechados + mês atual):
${JSON.stringify(itensRelevantes, null, 2)}

PREFERÊNCIAS DO USUÁRIO:
Pote analisado: ${questionario.pote || 'Todos'}
Principal preocupação: ${questionario.preocupacao.opcao || 'não informado'}
${questionario.preocupacao.comentario ? `Detalhe: ${questionario.preocupacao.comentario}` : ''}
Foco da análise: ${questionario.foco.opcao || 'não informado'}
${questionario.foco.comentario ? `Detalhe: ${questionario.foco.comentario}` : ''}

INSTRUÇÕES:
1. Agrupe itens similares mesmo com nomes diferentes (ex: "COCA COLA 2L" e "REFRI COCA 2L" são o mesmo)
2. Para cada grupo, calcule min/média/max por estabelecimento
3. Considere apenas itens comprados 3+ vezes
4. Identifique padrões de variação de preço
5. Calcule economia potencial mensal

RETORNE UM JSON com esta estrutura EXATA:
{
  "itens": [
    {
      "descricao": "Nome do produto normalizado",
      "categoria": "categoria do produto",
      "estabelecimentos": [
        {
          "nome": "Nome do estabelecimento",
          "preco_minimo": 0.00,
          "preco_medio": 0.00,
          "preco_maximo": 0.00,
          "vezes": 0,
          "tendencia": "estavel|subindo|descendo"
        }
      ],
      "melhor_opcao": "Nome do estabelecimento mais barato",
      "pior_opcao": "Nome do estabelecimento mais caro",
      "economia_mensal_potencial": 0.00,
      "insight": "Observação específica sobre este item"
    }
  ],
  "resumo": {
    "total_itens_analisados": 0,
    "economia_total_potencial": 0.00,
    "estabelecimento_mais_barato": "nome",
    "estabelecimento_mais_caro": "nome",
    "item_maior_variacao": "nome do item",
    "recomendacao_principal": "texto da recomendação"
  }
}

Retorne APENAS o JSON, sem texto adicional.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    throw new Error('Erro na API Gemini: ' + await response.text())
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
}
