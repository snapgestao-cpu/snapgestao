import { getCycle, isCurrentCycle, formatDateShort } from '../lib/cycle'

describe('getCycle', () => {
  it('offset 0 retorna ciclo contendo hoje', () => {
    const { start, end } = getCycle(1, 0)
    const today = new Date()
    expect(start.getTime()).toBeLessThanOrEqual(today.getTime())
    expect(end.getTime()).toBeGreaterThanOrEqual(today.getTime())
  })

  it('offset +1 começa depois do offset 0', () => {
    const current = getCycle(1, 0)
    const next = getCycle(1, 1)
    expect(next.start.getTime()).toBeGreaterThan(current.start.getTime())
  })

  it('offset -1 começa antes do offset 0', () => {
    const current = getCycle(1, 0)
    const prev = getCycle(1, -1)
    expect(prev.start.getTime()).toBeLessThan(current.start.getTime())
  })

  it('startISO e endISO são strings no formato YYYY-MM-DD', () => {
    const { startISO, endISO } = getCycle(5, 0)
    expect(startISO).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(endISO).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('start sempre no dia configurado do ciclo', () => {
    const { start } = getCycle(15, 0)
    expect(start.getDate()).toBe(15)
  })

  it('ciclo de 1 dia (cycleStart=1) tem start.date=1', () => {
    const { start } = getCycle(1, 0)
    expect(start.getDate()).toBe(1)
  })

  it('offset retorna o offset correto', () => {
    expect(getCycle(1, 3).offset).toBe(3)
    expect(getCycle(1, -2).offset).toBe(-2)
  })

  it('monthYear contém mês e ano', () => {
    const { monthYear } = getCycle(1, 0)
    expect(monthYear).toMatch(/\w+ \d{4}/)
  })
})

describe('isCurrentCycle', () => {
  it('retorna true para offset 0', () => {
    expect(isCurrentCycle(0)).toBe(true)
  })

  it('retorna false para qualquer outro offset', () => {
    expect(isCurrentCycle(1)).toBe(false)
    expect(isCurrentCycle(-1)).toBe(false)
  })
})

describe('formatDateShort', () => {
  it('retorna "Hoje" para data de hoje', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(formatDateShort(today)).toBe('Hoje')
  })

  it('retorna "Ontem" para data de ontem', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    expect(formatDateShort(yesterday)).toBe('Ontem')
  })

  it('formata outras datas como "D Mês"', () => {
    const result = formatDateShort('2025-03-15')
    expect(result).toBe('15 Mar')
  })
})
