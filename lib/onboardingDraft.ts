import { IncomeSource } from '../types'

export type IncomeSourceDraft = Omit<IncomeSource, 'id' | 'user_id'>

type Draft = {
  balance: number
  currency: string
  cycleStart: number
  incomeSources: IncomeSourceDraft[]
}

const defaults: Draft = {
  balance: 0,
  currency: 'BRL',
  cycleStart: 1,
  incomeSources: [],
}

let _d: Draft = { ...defaults, incomeSources: [] }

export const onboardingDraft = {
  get(): Draft {
    return { ..._d, incomeSources: [..._d.incomeSources] }
  },
  set(updates: Partial<Omit<Draft, 'incomeSources'>>): void {
    _d = { ..._d, ...updates }
  },
  addSource(source: IncomeSourceDraft): void {
    _d.incomeSources = [..._d.incomeSources, source]
  },
  removeSource(index: number): void {
    _d.incomeSources = _d.incomeSources.filter((_, i) => i !== index)
  },
  clear(): void {
    _d = { ...defaults, incomeSources: [] }
  },
}

// Currency mask helpers shared by all 3 steps
export function formatCents(rawDigits: string): string {
  if (!rawDigits) return ''
  const n = parseInt(rawDigits, 10)
  const reais = Math.floor(n / 100)
  const cents = n % 100
  const reaisStr = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$ ${reaisStr},${String(cents).padStart(2, '0')}`
}

export function digitsOnly(text: string, maxLen = 10): string {
  return text.replace(/\D/g, '').slice(0, maxLen)
}

export function centsToFloat(rawDigits: string): number {
  if (!rawDigits) return 0
  return parseInt(rawDigits, 10) / 100
}
