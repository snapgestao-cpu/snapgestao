export function calcFV(monthlyDeposit: number, annualRatePct: number, years: number): number {
  if (monthlyDeposit <= 0 || years <= 0) return 0
  const r = annualRatePct / 12 / 100
  const n = years * 12
  if (r === 0) return monthlyDeposit * n
  return monthlyDeposit * ((Math.pow(1 + r, n) - 1) / r)
}

export function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
