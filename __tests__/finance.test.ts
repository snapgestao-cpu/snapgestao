import { brl, fmtShort, fmtSigned, calcFV } from '../lib/finance'

describe('brl', () => {
  it('formata valor positivo em BRL', () => {
    expect(brl(1000)).toBe('R$\u00a01.000,00')
  })

  it('formata valor com centavos', () => {
    expect(brl(123.45)).toBe('R$\u00a0123,45')
  })

  it('formata zero', () => {
    expect(brl(0)).toBe('R$\u00a00,00')
  })
})

describe('fmtShort', () => {
  it('valores abaixo de 1000 não abreviam', () => {
    expect(fmtShort(500)).toBe('R$500')
    expect(fmtShort(0)).toBe('R$0')
  })

  it('valores >= 1000 usam sufixo k com 1 decimal', () => {
    expect(fmtShort(1000)).toBe('R$1.0k')
    expect(fmtShort(1500)).toBe('R$1.5k')
    expect(fmtShort(10000)).toBe('R$10.0k')
  })

  it('arredonda corretamente', () => {
    expect(fmtShort(1234)).toBe('R$1.2k')
    expect(fmtShort(9999)).toBe('R$10.0k')
  })
})

describe('fmtSigned', () => {
  it('positivo sem sinal', () => {
    expect(fmtSigned(500)).toBe('R$500')
    expect(fmtSigned(2000)).toBe('R$2.0k')
  })

  it('negativo com sinal de menos', () => {
    expect(fmtSigned(-500)).toBe('-R$500')
    expect(fmtSigned(-1500)).toBe('-R$1.5k')
  })

  it('zero sem sinal', () => {
    expect(fmtSigned(0)).toBe('R$0')
  })
})

describe('calcFV', () => {
  it('retorna 0 para aporte zero', () => {
    expect(calcFV(0, 10, 10)).toBe(0)
  })

  it('retorna 0 para anos zero', () => {
    expect(calcFV(1000, 10, 0)).toBe(0)
  })

  it('sem juros → aporte simples multiplicado por meses', () => {
    expect(calcFV(100, 0, 1)).toBeCloseTo(1200, 0)
  })

  it('com juros → valor futuro maior que aporte simples', () => {
    const fv = calcFV(100, 12, 10)
    const simple = 100 * 120
    expect(fv).toBeGreaterThan(simple)
  })

  it('resultado conhecido: R$100/mês, 12% a.a., 1 ano', () => {
    // FV = 100 * ((1.01^12 - 1) / 0.01) ≈ 1268.25
    expect(calcFV(100, 12, 1)).toBeCloseTo(1268.25, 0)
  })
})
