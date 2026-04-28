import { supabase } from './supabase'
import { getCycle } from './cycle'
import { Pot } from '../types'

async function enrichWithHistory(pots: Pot[], cycleStartISO: string): Promise<Pot[]> {
  if (!pots.length) return []
  return Promise.all(
    pots.map(async (pot) => {
      const { data } = await supabase
        .from('pot_history')
        .select('name, limit_amount')
        .eq('pot_id', pot.id)
        .lte('valid_from', cycleStartISO)
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
        ? { ...pot, name: (data as any).name, limit_amount: (data as any).limit_amount }
        : pot
    })
  )
}

// Drop-in replacement for fetchPotsForCycle that overlays historical name/limit
export async function fetchPotsForCycleWithHistory(
  userId: string,
  cycleStartISO: string,
  cycleEndISO: string,
): Promise<Pot[]> {
  const [activeRes, deletedRes] = await Promise.all([
    supabase.from('pots').select('*')
      .eq('user_id', userId).eq('is_emergency', false)
      .is('deleted_at', null)
      .lte('created_at', cycleEndISO)
      .order('created_at', { ascending: true }),
    supabase.from('pots').select('*')
      .eq('user_id', userId).eq('is_emergency', false)
      .not('deleted_at', 'is', null)
      .lte('created_at', cycleEndISO)
      .gt('deleted_at', cycleEndISO)
      .order('created_at', { ascending: true }),
  ])
  const pots = [
    ...((activeRes.data ?? []) as Pot[]),
    ...((deletedRes.data ?? []) as Pot[]),
  ]
  return enrichWithHistory(pots, cycleStartISO)
}

// Get a single pot's name/limit as it was at a specific cycle offset
export async function getPotAtMonth(
  potId: string,
  cycleStart: number,
  offset: number,
): Promise<{ name: string; limit_amount: number } | null> {
  const { start } = getCycle(cycleStart, offset)
  const validFrom = start.toISOString().split('T')[0]

  const { data } = await supabase
    .from('pot_history')
    .select('name, limit_amount')
    .eq('pot_id', potId)
    .lte('valid_from', validFrom)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data as { name: string; limit_amount: number } | null
}

// Convenience wrapper: fetch pots for a month by cycle offset
export async function getPotsForMonth(
  userId: string,
  cycleStart: number,
  offset: number,
): Promise<Pot[]> {
  const { startISO, endISO } = getCycle(cycleStart, offset)
  return fetchPotsForCycleWithHistory(userId, startISO, endISO)
}

// Upsert a pot_history entry for the current month (create or update)
export async function upsertPotHistory(
  potId: string,
  userId: string,
  name: string,
  limitAmount: number,
  cycleStart: number,
): Promise<void> {
  const { start } = getCycle(cycleStart, 0)
  const validFrom = start.toISOString().split('T')[0]

  const { data: existing } = await supabase
    .from('pot_history')
    .select('id')
    .eq('pot_id', potId)
    .eq('valid_from', validFrom)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('pot_history')
      .update({ name, limit_amount: limitAmount })
      .eq('id', (existing as any).id)
  } else {
    await supabase
      .from('pot_history')
      .insert({ pot_id: potId, user_id: userId, name, limit_amount: limitAmount, valid_from: validFrom })
  }
}
