import { supabase } from './supabase'

export async function hasAnyCreditCard(userId: string): Promise<boolean> {
  const { count } = await supabase
    .from('credit_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return (count ?? 0) > 0
}
