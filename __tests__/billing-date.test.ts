import { calcBillingDate, calcBillingDateNoCard } from '../lib/billing-date'
import type { CreditCard } from '../types'

const card = (closing: number, due: number): CreditCard => ({
  id: 'c1', user_id: 'u1', name: 'Cartão', closing_day: closing, due_day: due,
  last_four: null, credit_limit: null, brand: null,
})

describe('calcBillingDate', () => {
  // fecha dia 10, vence dia 5 → due(5) < closing(10) → billing +2 meses
  const c = card(10, 5)

  it('compra antes do fechamento → vence neste ciclo', () => {
    // Compra 01/Jan, d(1) < closing(10) → mes0 = 0; due<closing → +1 → mes 1 (Fev) → 2025-02-05
    expect(calcBillingDate('2025-01-01', c)).toBe('2025-02-05')
  })

  it('compra no dia do fechamento → avança para próximo ciclo', () => {
    // Compra 10/Jan, d(10) >= closing(10) → mes0 = 1; +1 → mes 2 (Mar) → 2025-03-05
    expect(calcBillingDate('2025-01-10', c)).toBe('2025-03-05')
  })

  it('compra depois do fechamento → avança para próximo ciclo', () => {
    expect(calcBillingDate('2025-01-15', c)).toBe('2025-03-05')
  })

  it('cartão fecha e vence no mesmo mês (due >= closing)', () => {
    // fecha dia 5, vence dia 20 → without +1 extra
    const c2 = card(5, 20)
    expect(calcBillingDate('2025-01-01', c2)).toBe('2025-01-20')
    expect(calcBillingDate('2025-01-05', c2)).toBe('2025-02-20')
  })

  it('virada de ano funciona corretamente', () => {
    // Compra 15/Dez → mes 12 (overflow) → +1 → mes 13 = Feb 2026
    expect(calcBillingDate('2025-12-15', c)).toBe('2026-02-05')
  })

  it('offset positivo adiciona meses ao billing_date', () => {
    const base = new Date(calcBillingDate('2025-01-01', c, 0))
    const plus1 = new Date(calcBillingDate('2025-01-01', c, 1))
    expect(plus1.getMonth()).toBe((base.getMonth() + 1) % 12)
  })
})

describe('calcBillingDateNoCard', () => {
  it('retorna o dia 1 do próximo mês', () => {
    expect(calcBillingDateNoCard('2025-03-15')).toBe('2025-04-01')
  })

  it('virada de ano', () => {
    expect(calcBillingDateNoCard('2025-12-01')).toBe('2026-01-01')
  })
})
