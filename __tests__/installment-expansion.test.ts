import {
  expandFutureInstallments, billingMonthKey, replaceInstallmentSuffix,
  InstallmentSeed,
} from '../lib/installment-expansion'
import { calcBillingDateNoCard, calcBillingDate } from '../lib/billing-date'
import type { CreditCard } from '../types'

const card = (closing: number, due: number): CreditCard => ({
  id: 'c1', user_id: 'u1', name: 'Cartão', closing_day: closing, due_day: due,
  last_four: null, credit_limit: null, brand: null,
})

const seed = (over: Partial<InstallmentSeed>): InstallmentSeed => ({
  date: '2025-01-15',
  merchant: 'Loja X',
  amount: 100,
  description: 'Loja X (4/12)',
  installmentNumber: 4,
  installmentTotalDetected: 12,
  ...over,
})

describe('replaceInstallmentSuffix', () => {
  it('substitui um sufixo existente', () => {
    expect(replaceInstallmentSuffix('Loja X (04/12)', 5, 12)).toBe('Loja X (5/12)')
  })
  it('anexa quando não há sufixo', () => {
    expect(replaceInstallmentSuffix('Loja X', 5, 12)).toBe('Loja X (5/12)')
  })
})

describe('billingMonthKey', () => {
  it('normaliza merchant e usa YYYY-MM do billing', () => {
    expect(billingMonthKey('  Loja X ', 100, '2025-03-05')).toBe('loja x|100.00|2025-03')
  })
})

describe('expandFutureInstallments — sem cartão (calcBillingDateNoCard)', () => {
  it('cria a âncora + parcelas 5..12 (8 futuras), sem dedup', () => {
    const { rows, skipped } = expandFutureInstallments(seed({}), null, undefined, new Set(), 'G1')
    expect(skipped).toBe(0)
    expect(rows).toHaveLength(9) // 1 âncora + 8 futuras
    expect(rows[0].isSyntheticFuture).toBe(false)
    expect(rows.slice(1).every(r => r.isSyntheticFuture)).toBe(true)
    expect(rows.map(r => r.installmentNumber)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(rows.every(r => r.installmentGroupId === 'G1')).toBe(true)
    expect(rows[0].description).toBe('Loja X (4/12)')
    expect(rows[8].description).toBe('Loja X (12/12)')
    // âncora vence no mês seguinte à compra (offset 0); a última, 8 meses depois.
    expect(rows[0].billingDate).toBe(calcBillingDateNoCard('2025-01-15', 0))
    expect(rows[8].billingDate).toBe(calcBillingDateNoCard('2025-01-15', 8))
  })

  it('pula a parcela futura cuja chave já existe (dedup) e conta o skip', () => {
    const dupBilling = calcBillingDateNoCard('2025-01-15', 1) // parcela 5
    const existing = new Set([billingMonthKey('Loja X', 100, dupBilling)])
    const { rows, skipped } = expandFutureInstallments(seed({}), null, undefined, existing, 'G1')
    expect(skipped).toBe(1)
    expect(rows).toHaveLength(8) // 9 − 1 pulada
    expect(rows.some(r => r.installmentNumber === 5)).toBe(false)
    expect(rows.some(r => r.installmentNumber === 6)).toBe(true)
  })

  it('parcela única (N == T) retorna só a âncora', () => {
    const { rows, skipped } = expandFutureInstallments(
      seed({ installmentNumber: 3, installmentTotalDetected: 3, description: 'X (3/3)' }),
      null, undefined, new Set(), 'G1',
    )
    expect(skipped).toBe(0)
    expect(rows).toHaveLength(1)
    expect(rows[0].isSyntheticFuture).toBe(false)
  })
})

describe('expandFutureInstallments — com cartão + overrides', () => {
  it('futuras respeitam o cartão e o override do mês final', () => {
    const c = card(10, 5) // due<closing → fatura ~2 meses após a compra
    const s = seed({ date: '2025-01-01', installmentNumber: 1, installmentTotalDetected: 3 })
    // Sem override, calcula billing normal por parcela.
    const plain = expandFutureInstallments(s, c, undefined, new Set(), 'G1')
    expect(plain.rows).toHaveLength(3)
    expect(plain.rows[0].billingDate).toBe(calcBillingDate('2025-01-01', c, 0))
    expect(plain.rows[2].billingDate).toBe(calcBillingDate('2025-01-01', c, 2))

    // Override do due_day no mês final da 1ª parcela (Fev/2025) muda só o dia dela.
    const overrides = { '2025-02-01': { due_day: 9 } }
    const withOv = expandFutureInstallments(s, c, overrides, new Set(), 'G2')
    expect(withOv.rows[0].billingDate).toBe('2025-02-09')
  })
})
