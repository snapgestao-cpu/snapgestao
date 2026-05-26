/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Store global do ciclo financeiro com Zustand. Sincroniza
 * cycleOffset e viewMode entre as telas Mensal e Potes.
 * Também armazena o contador de lançamentos pendentes para
 * o badge do tab Potes.
 */

import { create } from 'zustand'

type CycleStore = {
  cycleOffset: number
  setCycleOffset: (offset: number) => void
  viewMode: 'tabela' | 'potes'
  setViewMode: (mode: 'tabela' | 'potes') => void
  alertsExpanded: boolean
  setAlertsExpanded: (v: boolean) => void
  pendingScheduledCount: number
  setPendingScheduledCount: (n: number) => void
}

export const useCycleStore = create<CycleStore>((set) => ({
  cycleOffset: 0,
  setCycleOffset: (offset) => set({ cycleOffset: offset }),
  viewMode: 'tabela',
  setViewMode: (mode) => set({ viewMode: mode }),
  alertsExpanded: true,
  setAlertsExpanded: (v) => set({ alertsExpanded: v }),
  pendingScheduledCount: 0,
  setPendingScheduledCount: (n) => set({ pendingScheduledCount: n }),
}))
