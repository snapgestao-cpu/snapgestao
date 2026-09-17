/**
 * Expansão de compras parceladas detectadas na leitura da fatura.
 *
 * A IA (lib/bank-statement-ai.ts) detecta "N/T" numa linha da fatura — ex: "4/12".
 * A linha em si é a parcela N (já cobrada neste mês). Aqui geramos as parcelas
 * FUTURAS restantes (N+1..T), com billing_date calculado a partir do billing da
 * parcela atual (offset relativo), reaproveitando calcBillingDate/NoCard.
 *
 * Puro/sem I/O — o conjunto de chaves de duplicatas já existentes é passado de
 * fora (buscado no banco pelo caller). Testável isoladamente.
 */
import type { CreditCard } from '../types'
import type { CycleOverridesMap } from './billing-date'
import { calcBillingDate, calcBillingDateNoCard } from './billing-date'

export type InstallmentSeed = {
  date: string                       // ISO da linha da fatura
  merchant: string
  amount: number                     // valor da parcela (já dividido)
  description: string                // já contém "(N/T)" para exibição
  installmentNumber: number          // N
  installmentTotalDetected: number   // T
}

export type ExpandedInstallment = {
  installmentNumber: number
  installmentTotalDetected: number
  installmentGroupId: string
  billingDate: string
  description: string                // "(k/T)"
  isSyntheticFuture: boolean         // false = parcela atual (âncora); true = futura criada
}

// Chave de deduplicação: mesmo estabelecimento + valor + mês do billing_date.
export function billingMonthKey(merchant: string, amount: number, billingISO: string): string {
  return `${(merchant ?? '').trim().toLowerCase()}|${amount.toFixed(2)}|${billingISO.slice(0, 7)}`
}

// Substitui (ou anexa) o sufixo "(num/total)" na descrição.
export function replaceInstallmentSuffix(desc: string, num: number, total: number): string {
  const re = /\(\d{1,3}\/\d{1,3}\)\s*$/
  const base = `${num}/${total}`
  if (re.test(desc)) return desc.replace(re, `(${base})`)
  return `${desc.trim()} (${base})`
}

/**
 * Expande uma compra parcelada na parcela atual (âncora) + as futuras restantes.
 * Pula as futuras cuja chave já existe em `existingKeys` (dedup) e conta quantas
 * foram puladas. Se não for parcelada (T <= N), retorna só a âncora.
 */
export function expandFutureInstallments(
  seed: InstallmentSeed,
  card: CreditCard | null,
  overrides: CycleOverridesMap | undefined,
  existingKeys: Set<string>,
  groupId: string,
): { rows: ExpandedInstallment[]; skipped: number } {
  const N = seed.installmentNumber
  const T = seed.installmentTotalDetected

  const billingOf = (offset: number) =>
    card ? calcBillingDate(seed.date, card, offset, overrides) : calcBillingDateNoCard(seed.date, offset)

  // Âncora (parcela atual) — offset 0 relativo a ela mesma.
  const rows: ExpandedInstallment[] = [{
    installmentNumber: N,
    installmentTotalDetected: T,
    installmentGroupId: groupId,
    billingDate: billingOf(0),
    description: replaceInstallmentSuffix(seed.description, N, T),
    isSyntheticFuture: false,
  }]

  let skipped = 0
  for (let k = N + 1; k <= T; k++) {
    const billingDate = billingOf(k - N)  // futura k está (k−N) ciclos à frente da atual
    const key = billingMonthKey(seed.merchant, seed.amount, billingDate)
    if (existingKeys.has(key)) { skipped++; continue }
    rows.push({
      installmentNumber: k,
      installmentTotalDetected: T,
      installmentGroupId: groupId,
      billingDate,
      description: replaceInstallmentSuffix(seed.description, k, T),
      isSyntheticFuture: true,
    })
  }

  return { rows, skipped }
}
