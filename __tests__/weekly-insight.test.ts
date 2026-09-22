import {
  mondayOfWeek, addDaysISO, weekRangeFromMonday, pctChange, formatWeekLabel, buildWeeklyPrompt,
} from '../lib/weekly-insight'

// 2026-09-21 é uma segunda-feira; 09-22 terça; 09-27 domingo; 09-28 próxima segunda.
describe('mondayOfWeek', () => {
  it('terça retorna a segunda da mesma semana', () => {
    expect(mondayOfWeek(new Date(2026, 8, 22))).toBe('2026-09-21')
  })
  it('segunda retorna ela mesma', () => {
    expect(mondayOfWeek(new Date(2026, 8, 21))).toBe('2026-09-21')
  })
  it('domingo pertence à semana que começou na segunda anterior', () => {
    expect(mondayOfWeek(new Date(2026, 8, 27))).toBe('2026-09-21')
  })
  it('próxima segunda vira nova semana', () => {
    expect(mondayOfWeek(new Date(2026, 8, 28))).toBe('2026-09-28')
  })
  it('o resultado é sempre uma segunda-feira', () => {
    for (let d = 1; d <= 28; d++) {
      const iso = mondayOfWeek(new Date(2026, 8, d))
      const [y, m, dd] = iso.split('-').map(Number)
      expect(new Date(y, m - 1, dd).getDay()).toBe(1)
    }
  })
})

describe('addDaysISO', () => {
  it('soma dentro do mês', () => {
    expect(addDaysISO('2026-09-21', 6)).toBe('2026-09-27')
  })
  it('subtrai atravessando o mês', () => {
    expect(addDaysISO('2026-09-21', -7)).toBe('2026-09-14')
  })
  it('atravessa o mês', () => {
    expect(addDaysISO('2026-09-30', 1)).toBe('2026-10-01')
  })
  it('atravessa o ano', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('weekRangeFromMonday', () => {
  it('seg → seg..dom', () => {
    expect(weekRangeFromMonday('2026-09-21')).toEqual({ startISO: '2026-09-21', endISO: '2026-09-27' })
  })
})

describe('pctChange', () => {
  it('aumento', () => { expect(pctChange(150, 100)).toBe(50) })
  it('queda', () => { expect(pctChange(50, 100)).toBe(-50) })
  it('sem base (anterior 0) → null', () => { expect(pctChange(100, 0)).toBeNull() })
  it('anterior negativo/inválido → null', () => { expect(pctChange(100, -5)).toBeNull() })
})

describe('formatWeekLabel', () => {
  it('DD/MM a DD/MM', () => {
    expect(formatWeekLabel('2026-09-21', '2026-09-27')).toBe('21/09 a 27/09')
  })
})

describe('buildWeeklyPrompt', () => {
  const base = {
    weekLabel: '21/09 a 27/09',
    total: 1234.5,
    prevTotal: 1000,
    pct: 23.45,
    topPots: [{ name: 'Alimentação', amount: 500 }],
    topMerchants: [{ name: 'Mercado X', amount: 300 }],
  }
  it('inclui total, comparação e tops com valores em R$', () => {
    const p = buildWeeklyPrompt(base)
    expect(p).toContain('21/09 a 27/09')
    expect(p).toContain('R$')
    expect(p).toContain('Alimentação')
    expect(p).toContain('Mercado X')
    expect(p).toContain('+23%')
  })
  it('sem semana anterior comparável quando pct é null', () => {
    const p = buildWeeklyPrompt({ ...base, pct: null, prevTotal: 0 })
    expect(p).toContain('Sem semana anterior comparável')
  })
  it('lida com listas vazias sem quebrar', () => {
    const p = buildWeeklyPrompt({ ...base, topPots: [], topMerchants: [] })
    expect(p).toContain('nenhum pote com gasto')
    expect(p).toContain('nenhum estabelecimento registrado')
  })
})
