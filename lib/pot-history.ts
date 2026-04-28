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

// Upsert a pot_history entry for the viewed month (cycleOffset defaults to current month)
export async function upsertPotHistory(
  potId: string,
  userId: string,
  name: string,
  limitAmount: number,
  cycleStart: number,
  cycleOffset: number = 0,
): Promise<void> {
  const { start } = getCycle(cycleStart, cycleOffset)
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

// Create a pot with created_at = start of the viewed cycle month
export async function createPot(
  userId: string,
  name: string,
  limitAmount: number,
  color: string,
  limitType: string,
  cycleStart: number,
  cycleOffset: number = 0,
): Promise<any> {
  const { start } = getCycle(cycleStart, cycleOffset)
  const validFrom = start.toISOString().split('T')[0]
  const createdAt = new Date(validFrom + 'T12:00:00').toISOString()

  const { data: pot, error } = await supabase
    .from('pots')
    .insert({ user_id: userId, name, limit_amount: limitAmount, color, limit_type: limitType, created_at: createdAt })
    .select()
    .single()

  if (error) throw error

  await supabase
    .from('pot_history')
    .insert({ pot_id: pot.id, user_id: userId, name, limit_amount: limitAmount, valid_from: validFrom })

  return pot
}

// Update pot name/limit — writes to pot_history for the viewed month only
// Also mirrors to pots table for compatibility with places that read directly
export async function updatePot(
  potId: string,
  userId: string,
  changes: { name?: string; limit_amount?: number; color?: string; limit_type?: string; is_emergency?: boolean },
  cycleStart: number,
  cycleOffset: number = 0,
): Promise<void> {
  const { start } = getCycle(cycleStart, cycleOffset)
  const validFrom = start.toISOString().split('T')[0]

  if (changes.name !== undefined || changes.limit_amount !== undefined) {
    const { data: currentHistory } = await supabase
      .from('pot_history')
      .select('name, limit_amount')
      .eq('pot_id', potId)
      .lte('valid_from', validFrom)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle()

    const newName = changes.name ?? (currentHistory as any)?.name ?? 'Pote'
    const newLimit = changes.limit_amount ?? (currentHistory as any)?.limit_amount ?? 0

    await upsertPotHistory(potId, userId, newName, newLimit, cycleStart, cycleOffset)
  }

  // Mirror to pots for backward compat (color, limit_type, name, limit_amount)
  const potsUpdate: Record<string, unknown> = {}
  if (changes.name !== undefined) potsUpdate.name = changes.name
  if (changes.limit_amount !== undefined) potsUpdate.limit_amount = changes.limit_amount
  if (changes.color !== undefined) potsUpdate.color = changes.color
  if (changes.limit_type !== undefined) potsUpdate.limit_type = changes.limit_type
  if (changes.is_emergency !== undefined) potsUpdate.is_emergency = changes.is_emergency
  if (Object.keys(potsUpdate).length > 0) {
    await supabase.from('pots').update(potsUpdate).eq('id', potId).eq('user_id', userId)
  }
}

// Fetch pots with historical name/limit for multiple offsets in a single batch.
// Returns a map of offset → Pot[] so projection.tsx can use per-month limits.
export async function getPotsHistoryBatch(
  userId: string,
  cycleStart: number,
  offsets: number[],
): Promise<Record<number, Pot[]>> {
  const { data: pots } = await supabase
    .from('pots')
    .select('*')
    .eq('user_id', userId)
    .eq('is_emergency', false)
    .order('created_at', { ascending: true })

  if (!pots?.length) {
    return offsets.reduce((acc, o) => { acc[o] = []; return acc }, {} as Record<number, Pot[]>)
  }

  const potIds = (pots as Pot[]).map(p => p.id)
  const { data: allHistory } = await supabase
    .from('pot_history')
    .select('pot_id, name, limit_amount, valid_from')
    .in('pot_id', potIds)
    .order('valid_from', { ascending: true })

  const result: Record<number, Pot[]> = {}

  for (const offset of offsets) {
    const { startISO, endISO } = getCycle(cycleStart, offset)

    const potsInCycle = (pots as Pot[]).filter(p => {
      const createdStr = p.created_at.split('T')[0]
      const deletedStr = p.deleted_at ? p.deleted_at.split('T')[0] : null
      return createdStr <= endISO && (!deletedStr || deletedStr > endISO)
    })

    result[offset] = potsInCycle.map(pot => {
      const history = ((allHistory ?? []) as any[])
        .filter(h => h.pot_id === pot.id && h.valid_from <= startISO)
        .sort((a, b) => (b.valid_from as string).localeCompare(a.valid_from))[0]
      return history
        ? { ...pot, name: history.name, limit_amount: history.limit_amount }
        : pot
    })
  }

  return result
}

// Soft-delete a pot starting from the viewed cycle month
export async function deletePot(
  potId: string,
  userId: string,
  cycleStart: number,
  cycleOffset: number = 0,
): Promise<void> {
  const { start } = getCycle(cycleStart, cycleOffset)
  await supabase
    .from('pots')
    .update({ deleted_at: start.toISOString() })
    .eq('id', potId)
    .eq('user_id', userId)
}
