import { supabase } from './supabase'
import { getCycle } from './cycle'

export type MesValido = { start: string; end: string }

export async function getMesesValidos(
  userId: string,
  cycleStart: number
): Promise<MesValido[]> {
  const meses: MesValido[] = []

  // Sempre incluir mês atual
  const cicloAtual = getCycle(cycleStart, 0)
  meses.push({
    start: cicloAtual.start.toISOString().split('T')[0],
    end: cicloAtual.end.toISOString().split('T')[0],
  })

  // Ciclos fechados dos últimos 6 meses
  for (let offset = -1; offset >= -6; offset--) {
    const cycle = getCycle(cycleStart, offset)
    // Rollover é chaveado pelo início do PRÓXIMO ciclo
    const nextCycleStart = getCycle(cycleStart, offset + 1).startISO

    const { data: rollover } = await supabase
      .from('cycle_rollovers')
      .select('processed')
      .eq('user_id', userId)
      .eq('cycle_start_date', nextCycleStart)
      .maybeSingle()

    if (rollover?.processed === true) {
      meses.push({
        start: cycle.start.toISOString().split('T')[0],
        end: cycle.end.toISOString().split('T')[0],
      })
    }
  }

  return meses
}
