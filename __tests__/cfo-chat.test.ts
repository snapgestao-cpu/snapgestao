import {
  dailyMessageLimit, isWithinDailyLimit, parseToolInput,
  dailySearchLimit, isWithinSearchLimit,
} from '../lib/cfo-chat'

describe('dailyMessageLimit', () => {
  it('free = 10, premium = 40', () => {
    expect(dailyMessageLimit('free')).toBe(10)
    expect(dailyMessageLimit('premium')).toBe(40)
  })
})

describe('isWithinDailyLimit', () => {
  it('free permite até 9, bloqueia em 10', () => {
    expect(isWithinDailyLimit(0, 'free')).toBe(true)
    expect(isWithinDailyLimit(9, 'free')).toBe(true)
    expect(isWithinDailyLimit(10, 'free')).toBe(false)
    expect(isWithinDailyLimit(11, 'free')).toBe(false)
  })
  it('premium permite até 39, bloqueia em 40', () => {
    expect(isWithinDailyLimit(39, 'premium')).toBe(true)
    expect(isWithinDailyLimit(40, 'premium')).toBe(false)
  })
})

describe('cota de busca (independente do limite de mensagens)', () => {
  it('teto de busca = 5 e é bem menor que o de mensagens Premium (40)', () => {
    expect(dailySearchLimit()).toBe(5)
    expect(dailySearchLimit()).toBeLessThan(dailyMessageLimit('premium'))
  })
  it('permite até 4, bloqueia em 5', () => {
    expect(isWithinSearchLimit(0)).toBe(true)
    expect(isWithinSearchLimit(4)).toBe(true)
    expect(isWithinSearchLimit(5)).toBe(false)
    expect(isWithinSearchLimit(6)).toBe(false)
  })
})

describe('parseToolInput', () => {
  it('objeto passa direto (formato Claude)', () => {
    expect(parseToolInput({ cycle_offset: -1 })).toEqual({ cycle_offset: -1 })
  })
  it('string JSON é parseada (formato Groq)', () => {
    expect(parseToolInput('{"item_name":"arroz","city":"Rio"}')).toEqual({ item_name: 'arroz', city: 'Rio' })
  })
  it('string vazia ou inválida vira {}', () => {
    expect(parseToolInput('')).toEqual({})
    expect(parseToolInput('não é json')).toEqual({})
  })
  it('array/null/undefined viram {}', () => {
    expect(parseToolInput([1, 2])).toEqual({})
    expect(parseToolInput(null)).toEqual({})
    expect(parseToolInput(undefined)).toEqual({})
  })
})
