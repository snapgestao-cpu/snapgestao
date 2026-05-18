import { useAuthStore } from '../stores/useAuthStore'
import { PLAN_LIMITS } from '../constants/plans'

type PlanLimitsInput = {
  currentPots?: number
  currentGoals?: number
  currentCreditCards?: number
  currentIncomeSources?: number
}

export function usePlanLimits(counts: PlanLimitsInput = {}) {
  const { user, isPremium } = useAuthStore()
  const plan = user?.plan ?? 'free'
  const limits = PLAN_LIMITS[plan]

  const {
    currentPots = 0,
    currentGoals = 0,
    currentCreditCards = 0,
    currentIncomeSources = 0,
  } = counts

  const aiTokensRemaining = user?.ai_tokens ?? 0

  return {
    isPremium,
    canAddPot: currentPots < limits.pots,
    canAddGoal: currentGoals < limits.goals,
    canAddCreditCard: currentCreditCards < limits.creditCards,
    canAddIncomeSource: currentIncomeSources < limits.incomeSources,
    canUseIR: isPremium && (user?.ir_module_enabled ?? false),
    canExportExcel: limits.excelExport,
    canUseAI: aiTokensRemaining > 0,
    aiTokensRemaining,
    cycleHistoryLimit: limits.cycleHistoryMonths,
    potsLimit: limits.pots,
    goalsLimit: limits.goals,
    creditCardsLimit: limits.creditCards,
    incomeSourcesLimit: limits.incomeSources,
  }
}
