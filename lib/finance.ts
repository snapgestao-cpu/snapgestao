/**
 * Criador: Diego Manhães
 * Data: 07/05/2026
 * Modificado em: 07/05/2026
 *
 * Utilitários financeiros — cálculo de valor futuro (FV) com
 * juros compostos para projeção de metas, e formatação de
 * valores monetários em Real Brasileiro (BRL).
 */

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
