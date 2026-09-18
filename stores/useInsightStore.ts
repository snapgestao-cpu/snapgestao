/**
 * Store global do alerta reativo por lançamento notável (transaction-insights).
 *
 * Como os modais de gasto (NewExpenseModal/EditTransactionModal) fecham logo após
 * salvar e são usados em várias telas, a frase do insight é publicada aqui e exibida
 * por um <InsightToast /> global no _layout — mesmo padrão do BadgeToast global.
 */
import { create } from 'zustand'

type InsightStore = {
  message: string | null
  showInsight: (msg: string) => void
  clearInsight: () => void
}

export const useInsightStore = create<InsightStore>((set) => ({
  message: null,
  showInsight: (msg) => set({ message: msg }),
  clearInsight: () => set({ message: null }),
}))
