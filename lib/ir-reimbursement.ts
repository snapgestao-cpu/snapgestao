import { supabase } from './supabase'

export type HealthReimbursement = {
  amount: number
  description: string | null
}

export async function getHealthReimbursement(
  userId: string,
  year: number
): Promise<HealthReimbursement> {
  const { data } = await supabase
    .from('ir_health_reimbursements')
    .select('amount, description')
    .eq('user_id', userId)
    .eq('year', year)
    .maybeSingle()
  return { amount: Number(data?.amount ?? 0), description: data?.description ?? null }
}

export async function upsertHealthReimbursement(
  userId: string,
  year: number,
  amount: number,
  description?: string
): Promise<void> {
  await supabase
    .from('ir_health_reimbursements')
    .upsert(
      { user_id: userId, year, amount, description: description || null },
      { onConflict: 'user_id,year' }
    )
}
