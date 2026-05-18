export type Plan = 'free' | 'premium'

export const PLAN_LIMITS = {
  free: {
    pots: 10,
    goals: 5,
    creditCards: 2,
    incomeSources: 3,
    aiTokens: 2,
    cycleHistoryMonths: 3,
    irModule: false,
    excelExport: false,
  },
  premium: {
    pots: Infinity,
    goals: Infinity,
    creditCards: Infinity,
    incomeSources: Infinity,
    aiTokens: 10,
    cycleHistoryMonths: Infinity,
    irModule: true,
    excelExport: true,
  },
} as const

export function isPremium(plan: Plan): boolean {
  return plan === 'premium'
}

export function getLimit(plan: Plan, feature: keyof typeof PLAN_LIMITS.free) {
  return PLAN_LIMITS[plan][feature]
}
