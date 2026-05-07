/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Histórico de fontes de receita por mês. Alterações de valor
 * valem apenas do mês escolhido em diante — dissídios e reajustes
 * não afetam meses passados. Usa valid_from para lookup histórico
 * com lte + order desc limit 1.
 */

import { supabase } from './supabase'
import { getCycle } from './cycle'

export async function getIncomeAtMonth(
  incomeSourceId: string,
  cycleStart: number,
  offset: number
): Promise<number> {
  const { start } = getCycle(cycleStart, offset)
  const validFrom = start.toISOString().split('T')[0]

  const { data } = await supabase
    .from('income_source_history')
    .select('amount')
    .eq('income_source_id', incomeSourceId)
    .lte('valid_from', validFrom)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  return Number(data?.amount || 0)
}

export async function getIncomeSourcesForMonth(
  userId: string,
  cycleStart: number,
  offset: number
): Promise<Array<{ id: string; name: string; amount: number; type: string }>> {
  const { start } = getCycle(cycleStart, offset)
  const validFrom = start.toISOString().split('T')[0]

  const { data: sources } = await supabase
    .from('income_sources')
    .select('id, name, type')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (!sources?.length) return []

  const sourcesWithAmount = await Promise.all(
    sources.map(async (source) => {
      const { data: history } = await supabase
        .from('income_source_history')
        .select('amount')
        .eq('income_source_id', source.id)
        .lte('valid_from', validFrom)
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle()

      return {
        ...source,
        amount: Number(history?.amount || 0),
      }
    })
  )

  return sourcesWithAmount
}

export async function getIncomeSourcesBatch(
  userId: string,
  cycleStart: number,
  offsets: number[]
): Promise<Record<number, number>> {
  const { data: sources } = await supabase
    .from('income_sources')
    .select('id')
    .eq('user_id', userId)

  if (!sources?.length) {
    return offsets.reduce((acc, o) => { acc[o] = 0; return acc }, {} as Record<number, number>)
  }

  const { data: allHistory } = await supabase
    .from('income_source_history')
    .select('income_source_id, amount, valid_from')
    .eq('user_id', userId)
    .order('valid_from', { ascending: true })

  const history = allHistory || []
  const result: Record<number, number> = {}

  for (const offset of offsets) {
    const { start } = getCycle(cycleStart, offset)
    const startStr = start.toISOString().split('T')[0]
    let totalReceita = 0

    for (const source of sources) {
      const record = history
        .filter(h => h.income_source_id === source.id && h.valid_from <= startStr)
        .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]

      totalReceita += Number(record?.amount || 0)
    }

    result[offset] = totalReceita
  }

  return result
}

export async function updateIncomeSourceAmount(
  incomeSourceId: string,
  userId: string,
  newAmount: number,
  cycleStart: number,
  fromOffset: number
): Promise<void> {
  const { start } = getCycle(cycleStart, fromOffset)
  const validFrom = start.toISOString().split('T')[0]

  console.log('[Income] Atualizando fonte:', incomeSourceId, '| valor:', newAmount, '| a partir de:', validFrom, '| deletando registros >=', validFrom)

  // PASSO 1 — Deletar todos os registros com valid_from >= validFrom
  const { error: deleteError } = await supabase
    .from('income_source_history')
    .delete()
    .eq('income_source_id', incomeSourceId)
    .eq('user_id', userId)
    .gte('valid_from', validFrom)

  if (deleteError) {
    console.error('[Income] Erro ao deletar:', deleteError.message)
    throw deleteError
  }

  // PASSO 2 — Inserir novo registro
  const { error: insertError } = await supabase
    .from('income_source_history')
    .insert({ income_source_id: incomeSourceId, user_id: userId, amount: newAmount, valid_from: validFrom })

  if (insertError) {
    console.error('[Income] Erro ao inserir:', insertError.message)
    throw insertError
  }

  // PASSO 3 — Atualizar tabela principal para compatibilidade
  await supabase
    .from('income_sources')
    .update({ amount: newAmount })
    .eq('id', incomeSourceId)
    .eq('user_id', userId)

  console.log('[Income] Atualização concluída:', incomeSourceId, validFrom, newAmount)
}
