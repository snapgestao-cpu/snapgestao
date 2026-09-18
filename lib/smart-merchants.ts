/**
 * Sugestão automática de pote a partir do histórico de estabelecimentos.
 *
 * A tabela `smart_merchants` (name lowercase + pot_id, onConflict user_id+name)
 * é alimentada ao salvar gastos com "Estabelecimento" preenchido (NewExpenseModal/
 * EditTransactionModal). Aqui ela é LIDA de volta para pré-selecionar o pote que o
 * usuário costuma usar para aquele estabelecimento.
 */
import { supabase } from './supabase'

function normalizeMerchant(name: string): string {
  return name.trim().toLowerCase()
}

// Retorna o pot_id salvo para esse estabelecimento, ou null se não houver match.
export async function suggestPotForMerchant(userId: string, merchantName: string): Promise<string | null> {
  const name = normalizeMerchant(merchantName)
  if (!name) return null
  const { data } = await supabase
    .from('smart_merchants')
    .select('pot_id')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle()
  return (data as any)?.pot_id ?? null
}

// Versão em lote para o import de extrato (dezenas de linhas): 1 query só,
// retorna mapa nome-normalizado → pot_id.
export async function getMerchantPotMap(userId: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('smart_merchants')
    .select('name, pot_id')
    .eq('user_id', userId)
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as any[]) {
    if (row.pot_id && row.name) map[normalizeMerchant(String(row.name))] = row.pot_id
  }
  return map
}
