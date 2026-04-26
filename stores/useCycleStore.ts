import { create } from 'zustand'
import { AIProvider } from '../lib/ai-provider'

type CycleStore = {
  cycleOffset: number
  setCycleOffset: (offset: number) => void
  viewMode: 'tabela' | 'potes'
  setViewMode: (mode: 'tabela' | 'potes') => void
  alertsExpanded: boolean
  setAlertsExpanded: (v: boolean) => void
  aiProvider: AIProvider
  setAiProvider: (p: AIProvider) => void
}

export const useCycleStore = create<CycleStore>((set) => ({
  cycleOffset: 0,
  setCycleOffset: (offset) => set({ cycleOffset: offset }),
  viewMode: 'tabela',
  setViewMode: (mode) => set({ viewMode: mode }),
  alertsExpanded: true,
  setAlertsExpanded: (v) => set({ alertsExpanded: v }),
  aiProvider: 'claude',
  setAiProvider: (p) => set({ aiProvider: p }),
}))
