import { create } from 'zustand'

type CycleStore = {
  cycleOffset: number
  setCycleOffset: (offset: number) => void
}

export const useCycleStore = create<CycleStore>((set) => ({
  cycleOffset: 0,
  setCycleOffset: (offset) => set({ cycleOffset: offset }),
}))
