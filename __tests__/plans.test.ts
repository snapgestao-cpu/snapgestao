import { PLAN_LIMITS, isPremium, getLimit } from '../constants/plans'

describe('PLAN_LIMITS', () => {
  it('plano free tem limites numéricos corretos', () => {
    expect(PLAN_LIMITS.free.pots).toBe(10)
    expect(PLAN_LIMITS.free.goals).toBe(5)
    expect(PLAN_LIMITS.free.creditCards).toBe(2)
    expect(PLAN_LIMITS.free.incomeSources).toBe(3)
    expect(PLAN_LIMITS.free.aiTokens).toBe(2)
    expect(PLAN_LIMITS.free.cycleHistoryMonths).toBe(3)
  })

  it('plano free tem recursos premium desabilitados', () => {
    expect(PLAN_LIMITS.free.irModule).toBe(false)
    expect(PLAN_LIMITS.free.excelExport).toBe(false)
  })

  it('plano premium tem limites infinitos', () => {
    expect(PLAN_LIMITS.premium.pots).toBe(Infinity)
    expect(PLAN_LIMITS.premium.goals).toBe(Infinity)
    expect(PLAN_LIMITS.premium.creditCards).toBe(Infinity)
    expect(PLAN_LIMITS.premium.incomeSources).toBe(Infinity)
    expect(PLAN_LIMITS.premium.cycleHistoryMonths).toBe(Infinity)
  })

  it('plano premium tem tokens de IA maiores', () => {
    expect(PLAN_LIMITS.premium.aiTokens).toBeGreaterThan(PLAN_LIMITS.free.aiTokens)
    expect(PLAN_LIMITS.premium.aiTokens).toBe(10)
  })

  it('plano premium tem recursos premium habilitados', () => {
    expect(PLAN_LIMITS.premium.irModule).toBe(true)
    expect(PLAN_LIMITS.premium.excelExport).toBe(true)
  })
})

describe('isPremium', () => {
  it('retorna true para premium', () => {
    expect(isPremium('premium')).toBe(true)
  })

  it('retorna false para free', () => {
    expect(isPremium('free')).toBe(false)
  })
})

describe('getLimit', () => {
  it('retorna o limite correto por plano e feature', () => {
    expect(getLimit('free', 'pots')).toBe(10)
    expect(getLimit('premium', 'pots')).toBe(Infinity)
    expect(getLimit('free', 'aiTokens')).toBe(2)
    expect(getLimit('premium', 'aiTokens')).toBe(10)
  })

  it('retorna boolean para features booleanas', () => {
    expect(getLimit('free', 'irModule')).toBe(false)
    expect(getLimit('premium', 'irModule')).toBe(true)
    expect(getLimit('free', 'excelExport')).toBe(false)
    expect(getLimit('premium', 'excelExport')).toBe(true)
  })
})
