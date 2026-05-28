import { calcDebtMonthsRemaining } from '../lib/debts'
import type { Debt } from '../lib/debts'

const debt = (total: number, paid: number, monthly: number | null): Debt => ({
  id: 'd1',
  user_id: 'u1',
  name: 'Dívida teste',
  total_amount: total,
  paid_amount: paid,
  monthly_payment: monthly,
  target_date: null,
  status: 'active',
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
})

describe('calcDebtMonthsRemaining', () => {
  it('retorna null quando não há parcela mensal', () => {
    expect(calcDebtMonthsRemaining(debt(1000, 0, null))).toBeNull()
  })

  it('retorna null quando parcela é zero', () => {
    expect(calcDebtMonthsRemaining(debt(1000, 0, 0))).toBeNull()
  })

  it('retorna 0 quando dívida já está quitada', () => {
    expect(calcDebtMonthsRemaining(debt(1000, 1000, 200))).toBe(0)
  })

  it('retorna 0 quando pago ultrapassa o total', () => {
    expect(calcDebtMonthsRemaining(debt(1000, 1200, 200))).toBe(0)
  })

  it('calcula meses exatos', () => {
    // Restante = 1000, parcela = 200 → 5 meses
    expect(calcDebtMonthsRemaining(debt(1000, 0, 200))).toBe(5)
  })

  it('arredonda para cima quando não é divisível', () => {
    // Restante = 1000, parcela = 300 → 3.33... → ceil = 4
    expect(calcDebtMonthsRemaining(debt(1000, 0, 300))).toBe(4)
  })

  it('funciona com pagamento parcial', () => {
    // Total=1000, pago=400, restante=600, parcela=200 → 3 meses
    expect(calcDebtMonthsRemaining(debt(1000, 400, 200))).toBe(3)
  })

  it('parcela negativa retorna null', () => {
    expect(calcDebtMonthsRemaining(debt(1000, 0, -100))).toBeNull()
  })
})
