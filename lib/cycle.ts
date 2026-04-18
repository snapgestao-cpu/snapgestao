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
  let baseMonth = today.getMonth() // 0-indexed

  // If today hasn't reached cycleStart yet, the current cycle started last month
  if (day < cycleStart) {
    baseMonth -= 1
    if (baseMonth < 0) { baseMonth = 11; baseYear -= 1 }
  }

  // Apply offset (months)
  baseMonth += offset
  while (baseMonth > 11) { baseMonth -= 12; baseYear += 1 }
  while (baseMonth < 0) { baseMonth += 12; baseYear -= 1 }

  const start = new Date(baseYear, baseMonth, cycleStart)

  // End = one day before cycleStart in the following month
  let endYear = baseYear
  let endMonth = baseMonth + 1
  if (endMonth > 11) { endMonth = 0; endYear += 1 }

  // Last valid day: cycleStart - 1, but handle month-end boundaries
  const endDayRaw = cycleStart - 1
  let endDay: number
  let actualEndMonth = endMonth
  let actualEndYear = endYear
  if (endDayRaw <= 0) {
    // cycleStart = 1 → end is last day of base month
    actualEndMonth = baseMonth
    actualEndYear = baseYear
    endDay = new Date(baseYear, baseMonth + 1, 0).getDate() // last day of baseMonth
  } else {
    endDay = endDayRaw
  }

  const end = new Date(actualEndYear, actualEndMonth, endDay)

  const startMonthName = MONTHS[baseMonth]
  const endMonthName = MONTHS[actualEndMonth]
  const label = endDay === cycleStart - 1 || cycleStart === 1
    ? `${cycleStart} ${startMonthName} → ${endDay} ${endMonthName} ${actualEndYear}`
    : `${cycleStart} ${startMonthName} → ${endDay} ${endMonthName} ${actualEndYear}`
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

export function formatDateShort(iso: string): string {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  if (iso === today) return 'Hoje'
  if (iso === yesterday) return 'Ontem'
  const [, m, d] = iso.split('-')
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`
}
