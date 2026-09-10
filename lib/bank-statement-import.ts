/**
 * Importação de extrato bancário (PDF).
 *
 * Envia o PDF (base64) para a Edge Function `parse-bank-statement`, que
 * extrai o texto e devolve as transações já normalizadas. Aqui apenas
 * mapeamos a resposta para o formato `BankImportRow`, estruturalmente
 * compatível com o `ImportRow` usado em `ImportFileModal`.
 *
 * A extração real (regex por banco) vive no backend — este módulo é só o
 * transporte + normalização de tipos.
 */

import { supabase } from './supabase'

export type StatementType = 'debito' | 'credito'

export type BankImportRow = {
  date: string
  description: string
  merchant: string
  amount: number
  type: 'expense' | 'income'
  paymentMethod: string
  installmentTotal: number
  potId: string | null
  poteName: string
  isNeed: boolean | null
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Normaliza datas em string (o backend nunca envia serial do Excel).
// Aceita DD/MM/AAAA, DD/MM/AA e AAAA-MM-DD; cai para hoje se não reconhecer.
function parseDateISO(raw: any): string {
  const today = formatDateISO(new Date())
  if (!raw) return today
  const s = String(raw).trim()
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const dmy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (dmy2) return `20${dmy2[3]}-${dmy2[2].padStart(2, '0')}-${dmy2[1].padStart(2, '0')}`
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  return today
}

export async function parseBankStatement(
  bankId: string,
  statementType: StatementType,
  pdfBase64: string,
): Promise<BankImportRow[]> {
  const { data, error } = await supabase.functions.invoke('parse-bank-statement', {
    body: { bankId, statementType, pdfBase64 },
  })

  if (error) {
    throw new Error(error.message || 'Não foi possível processar o extrato bancário.')
  }
  if (data?.error) {
    throw new Error(String(data.error))
  }

  const transactions: any[] = Array.isArray(data?.transactions) ? data.transactions : []

  return transactions.map((t): BankImportRow => {
    const type: 'expense' | 'income' = t?.type === 'income' ? 'income' : 'expense'
    return {
      date: parseDateISO(t?.date),
      description: String(t?.description ?? '').trim() || 'Importado',
      merchant: String(t?.merchant ?? '').trim(),
      amount: Math.abs(Number(t?.amount) || 0),
      type,
      // Débito/crédito derivado do tipo de extrato quando o backend não especifica
      paymentMethod: t?.paymentMethod || (statementType === 'credito' ? 'credit' : 'debit'),
      installmentTotal: 1,
      potId: null,           // usuário atribui o pote na tela de assign
      poteName: '',
      isNeed: type === 'expense' ? true : null,
    }
  }).filter(r => r.amount > 0)
}
