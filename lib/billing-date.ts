import type { CreditCard } from '../types'

// Override pontual de fechamento/vencimento para um mês específico (exceção do
// ciclo, sem virar o padrão do cartão). Chave do mapa = primeiro dia do mês
// (YYYY-MM-01) — ver getCardOverridesMap em lib/credit-cards.ts.
export type CycleOverride = { closing_day?: number | null; due_day?: number | null }
export type CycleOverridesMap = Record<string, CycleOverride>

function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-01`
}

/**
 * Calcula o billing_date (data de vencimento na fatura) de uma compra no crédito.
 *
 * `overrides` (opcional) permite sobrescrever fechamento/vencimento SÓ em meses
 * específicos, sem alterar o padrão do cartão. A interação entre os dois pontos
 * de override NÃO é óbvia, então é explícita aqui:
 *
 *  - **closing_day** é lido do override do **MÊS NOMINAL da transação** (o mês em
 *    que a compra foi feita). Ele decide se a compra cai neste ciclo ou já entra
 *    no próximo (`d >= closing_day`). Ex.: se o cartão fecha dia 10 mas neste mês
 *    fechou dia 15, uma compra no dia 12 ainda entra neste ciclo.
 *  - **due_day** é lido do override do **MÊS FINAL** (o mês em que a fatura vence,
 *    já com o `offset` de parcela aplicado). Ele define só o DIA da data final.
 *
 * São dois lookups em meses potencialmente diferentes: o closing olha o mês de
 * ORIGEM da compra; o due olha o mês de DESTINO da fatura. A relação estrutural
 * `due_day < closing_day` (fatura paga no mês seguinte ao fechamento) continua
 * usando os dias PADRÃO do cartão — o override é uma exceção pontual, não mexe
 * nessa característica do cartão.
 *
 * Sem `overrides` (ou sem entrada para o mês), o comportamento é idêntico ao
 * original.
 */
export function calcBillingDate(
  txISO: string,
  card: CreditCard,
  offset = 0,
  overrides?: CycleOverridesMap,
): string {
  const [y, m, d] = txISO.split('-').map(Number)

  // closing_day: override do MÊS NOMINAL da transação (YYYY-MM-01), senão o do cartão.
  const nominalOverride = overrides?.[monthKey(y, m - 1)]
  const closingDay = nominalOverride?.closing_day ?? card.closing_day

  let month0 = m - 1
  if (d >= closingDay) month0 += 1
  if (card.due_day < card.closing_day) month0 += 1
  month0 += offset
  let year = y
  while (month0 > 11) { month0 -= 12; year += 1 }

  // due_day: override do MÊS FINAL (onde a fatura cai), senão o do cartão.
  const finalOverride = overrides?.[monthKey(year, month0)]
  const dueDay = finalOverride?.due_day ?? card.due_day

  return new Date(year, month0, dueDay).toISOString().split('T')[0]
}

export function calcBillingDateNoCard(txISO: string, offset = 0): string {
  const [y, m] = txISO.split('-').map(Number)
  let month0 = m - 1 + 1 + offset
  let year = y
  while (month0 > 11) { month0 -= 12; year += 1 }
  return new Date(year, month0, 1).toISOString().split('T')[0]
}
