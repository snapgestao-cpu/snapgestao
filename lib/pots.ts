import { supabase } from './supabase'
import { Pot } from '../types'

// Returns pots that existed during a given cycle:
// active pots (deleted_at IS NULL) + pots deleted during or after the cycle start.
export async function fetchPotsForCycle(
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
  return [
    ...((activeRes.data ?? []) as Pot[]),
    ...((deletedRes.data ?? []) as Pot[]),
  ]
}
