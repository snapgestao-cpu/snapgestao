/**
 * Sugestão automática de pote a partir do histórico de estabelecimentos.
 *
 * Tabela `smart_merchants` (schema real):
 *   id, user_id, merchant_name (lowercase), default_pot_id, usage_count, last_used, created_at
 *
 * BUG histórico: o código antigo usava `name`/`pot_id` (colunas inexistentes) →
 * toda escrita e leitura falhava silenciosamente. Corrigido para os nomes reais.
 *
 * Escrita: `recordMerchantUsage` (SELECT-antes-de-escrever — sem depender de
 * constraint UNIQUE, incrementa usage_count e atualiza last_used).
 * Leitura: só sugere com `usage_count >= 2` — um único uso (possível engano/typo)
 * não vira sugestão sozinho; precisa de pelo menos 2 usos consistentes.
 */
import { supabase } from './supabase'

// Só sugere a partir deste nº de usos (evita "engessar" sugestão errada no 1º uso).
const MIN_USES_FOR_SUGGESTION = 2

function normalizeMerchant(name: string): string {
  return name.trim().toLowerCase()
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// Retorna o pote habitual do estabelecimento (>= MIN_USES_FOR_SUGGESTION usos), ou null.
export async function suggestPotForMerchant(userId: string, merchantName: string): Promise<string | null> {
  const name = normalizeMerchant(merchantName)
  if (!name) return null
  const { data, error } = await supabase
    .from('smart_merchants')
    .select('default_pot_id')
    .eq('user_id', userId)
    .eq('merchant_name', name)
    .gte('usage_count', MIN_USES_FOR_SUGGESTION)
    .maybeSingle()
  if (error) { console.warn('[smart_merchants] suggestPotForMerchant falhou:', error.message); return null }
  return (data as any)?.default_pot_id ?? null
}

// Versão em lote para o import de extrato (dezenas de linhas): 1 query só,
// mapa nome-normalizado → default_pot_id, já filtrado por usage_count >= threshold.
export async function getMerchantPotMap(userId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('smart_merchants')
    .select('merchant_name, default_pot_id, usage_count')
    .eq('user_id', userId)
    .gte('usage_count', MIN_USES_FOR_SUGGESTION)
  if (error) { console.warn('[smart_merchants] getMerchantPotMap falhou:', error.message); return {} }
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as any[]) {
    if (row.default_pot_id && row.merchant_name) map[normalizeMerchant(String(row.merchant_name))] = row.default_pot_id
  }
  return map
}

// Registra o uso do estabelecimento: 1ª vez insere (usage_count=1); demais vezes
// incrementa usage_count, atualiza last_used e o default_pot_id (o pote escolhido
// agora). SELECT-antes-de-escrever — não depende de constraint UNIQUE (escrita
// sequencial de um único usuário, sem concorrência real). Nunca lança: só warn.
export async function recordMerchantUsage(
  userId: string,
  merchantName: string,
  potId: string | null,
): Promise<void> {
  const name = normalizeMerchant(merchantName)
  if (!name || !potId) return

  const { data: existing, error: selErr } = await supabase
    .from('smart_merchants')
    .select('id, usage_count')
    .eq('user_id', userId)
    .eq('merchant_name', name)
    .maybeSingle()
  if (selErr) { console.warn('[smart_merchants] leitura para upsert falhou:', selErr.message); return }

  if (existing) {
    const { error } = await supabase
      .from('smart_merchants')
      .update({
        default_pot_id: potId,
        usage_count: (Number((existing as any).usage_count) || 0) + 1,
        last_used: todayISO(),
      })
      .eq('id', (existing as any).id)
    if (error) console.warn('[smart_merchants] update falhou:', error.message)
  } else {
    const { error } = await supabase
      .from('smart_merchants')
      .insert({
        user_id: userId,
        merchant_name: name,
        default_pot_id: potId,
        usage_count: 1,
        last_used: todayISO(),
      })
    if (error) console.warn('[smart_merchants] insert falhou:', error.message)
  }
}
