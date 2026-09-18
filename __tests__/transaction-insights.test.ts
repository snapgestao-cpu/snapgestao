import { detectThresholdCrossing, isAmountOutlier } from '../lib/transaction-insights'

describe('detectThresholdCrossing', () => {
  it('limite ausente/zero → null', () => {
    expect(detectThresholdCrossing(0, 100, null)).toBeNull()
    expect(detectThresholdCrossing(0, 100, 0)).toBeNull()
  })

  it('cruzou 80% (mas não 100%) → near-limit', () => {
    expect(detectThresholdCrossing(50, 90, 100)).toBe('near-limit')
    // borda exata: 79 → 80
    expect(detectThresholdCrossing(79, 80, 100)).toBe('near-limit')
  })

  it('cruzou 100% → over-limit', () => {
    expect(detectThresholdCrossing(90, 110, 100)).toBe('over-limit')
    expect(detectThresholdCrossing(95, 100, 100)).toBe('over-limit')
  })

  it('já estava acima de 80% antes → não é cruzamento (null)', () => {
    expect(detectThresholdCrossing(85, 95, 100)).toBeNull()
  })

  it('bem abaixo do limite → null', () => {
    expect(detectThresholdCrossing(10, 30, 100)).toBeNull()
  })
})

describe('isAmountOutlier', () => {
  it('sem histórico mínimo (menos de 3) → false', () => {
    expect(isAmountOutlier(1000, [])).toBe(false)
    expect(isAmountOutlier(1000, [10, 10])).toBe(false)
  })

  it('acima de 2,5x a média com histórico suficiente → true', () => {
    expect(isAmountOutlier(30, [10, 10, 10])).toBe(true)     // 30 > 25
    expect(isAmountOutlier(100, [10, 20, 10, 15])).toBe(true)
  })

  it('na fronteira ou abaixo de 2,5x → false (comparação estrita)', () => {
    expect(isAmountOutlier(25, [10, 10, 10])).toBe(false)    // 25 não é > 25
    expect(isAmountOutlier(24, [10, 10, 10])).toBe(false)
  })

  it('média zero → false (evita divisão sem sentido)', () => {
    expect(isAmountOutlier(50, [0, 0, 0])).toBe(false)
  })

  it('respeita factor/minHistory customizados', () => {
    expect(isAmountOutlier(21, [10, 10], 2, 2)).toBe(true)   // 21 > 20, minHistory 2
    expect(isAmountOutlier(21, [10], 2, 2)).toBe(false)      // histórico insuficiente
  })
})
