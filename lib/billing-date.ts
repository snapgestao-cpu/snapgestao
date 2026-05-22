import type { CreditCard } from '../types'

export function calcBillingDate(txISO: string, card: CreditCard, offset = 0): string {
  const [y, m, d] = txISO.split('-').map(Number)
  let month0 = m - 1
  if (d >= card.closing_day) month0 += 1
  if (card.due_day < card.closing_day) month0 += 1
  month0 += offset
  let year = y
  while (month0 > 11) { month0 -= 12; year += 1 }
  return new Date(year, month0, card.due_day).toISOString().split('T')[0]
}

export function calcBillingDateNoCard(txISO: string, offset = 0): string {
  const [y, m] = txISO.split('-').map(Number)
  let month0 = m - 1 + 1 + offset
  let year = y
  while (month0 > 11) { month0 -= 12; year += 1 }
  return new Date(year, month0, 1).toISOString().split('T')[0]
}
