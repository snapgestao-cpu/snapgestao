import { create } from 'zustand'
import { Pot } from '../types'

type PotsState = {
  pots: Pot[]
  selectedPotId: string | null
  setPots: (pots: Pot[]) => void
  addPot: (pot: Pot) => void
  updatePot: (id: string, updates: Partial<Pot>) => void
  removePot: (id: string) => void
  selectPot: (id: string | null) => void
}

export const usePotsStore = create<PotsState>((set) => ({
  pots: [],
  selectedPotId: null,
  setPots: (pots) => set({ pots }),
  addPot: (pot) => set((state) => ({ pots: [...state.pots, pot] })),
  updatePot: (id, updates) =>
    set((state) => ({
      pots: state.pots.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),
  removePot: (id) =>
    set((state) => ({ pots: state.pots.filter((p) => p.id !== id) })),
  selectPot: (selectedPotId) => set({ selectedPotId }),
}))
