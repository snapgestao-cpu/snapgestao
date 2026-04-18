const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export type CycleInfo = {
  start: Date
  end: Date
  startISO: string
  endISO: string
  label: string
  monthYear: string
  offset: number
}

export function getCycle(cycleStart: number, offset = 0): CycleInfo {
  const today = new Date()
  const day = today.getDate()

  let baseYear = today.getFullYear()
  let baseMonth = today.getMonth()

  if (day < cycleStart) {
    baseMonth -= 1
    if (baseMonth < 0) { baseMonth = 11; baseYear -= 1 }
  }

  baseMonth += offset
  while (baseMonth > 11) { baseMonth -= 12; baseYear += 1 }
  while (baseMonth < 0) { baseMonth += 12; baseYear -= 1 }

  const start = new Date(baseYear, baseMonth, cycleStart)

  let endYear = baseYear
  let endMonth = baseMonth + 1
  if (endMonth > 11) { endMonth = 0; endYear += 1 }
  const end = new Date(endYear, endMonth, cycleStart - 1)

  const label = `${cycleStart} ${MONTHS[baseMonth]} → ${cycleStart - 1 || 31} ${MONTHS[endMonth]} ${endYear}`
  const monthYear = `${MONTHS[baseMonth]} ${baseYear}`

  return {
    start,
    end,
    startISO: start.toISOString().split('T')[0],
    endISO: end.toISOString().split('T')[0],
    label,
    monthYear,
    offset,
  }
}

export function isCurrentCycle(offset: number): boolean {
  return offset === 0
}

export function isFirstDayOfCycle(cycleStart: number): boolean {
  return new Date().getDate() === cycleStart
}

export function formatDateShort(iso: string): string {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  if (iso === today) return 'Hoje'
  if (iso === yesterday) return 'Ontem'
  const [, m, d] = iso.split('-')
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`
}
