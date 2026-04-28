import * as XLSX from 'xlsx'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { supabase } from './supabase'

const MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  debit: 'Débito',
  credit: 'Crédito',
  pix: 'Pix',
  transfer: 'Transferência',
  voucher_alimentacao: 'Vale Alimentação',
  voucher_refeicao: 'Vale Refeição',
}

function lastDayISO(year: number, month: number): string {
  // month is 1-based; new Date(y, m, 0) = last day of month m
  return new Date(year, month, 0).toISOString().split('T')[0]
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export type MonthYear = { year: number; month: number } // month is 1-based

export function addMonths(base: MonthYear, delta: number): MonthYear {
  const d = new Date(base.year, base.month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function monthYearLabel(my: MonthYear): string {
  return `${MONTH_SHORT[my.month - 1]}/${my.year}`
}

export async function exportTransactionsToExcel(
  userId: string,
  startISO: string,
  endISO: string,
  filenameLabel: string,
): Promise<void> {
  // Two parallel queries (no .or() per codebase rules)
  const [nonCreditRes, creditRes, potsRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('id,date,type,description,merchant,amount,payment_method,pot_id,installment_number,installment_total')
      .eq('user_id', userId)
      .neq('payment_method', 'credit')
      .gte('date', startISO)
      .lte('date', endISO)
      .order('date', { ascending: true }),
    supabase
      .from('transactions')
      .select('id,date,billing_date,type,description,merchant,amount,payment_method,pot_id,installment_number,installment_total')
      .eq('user_id', userId)
      .eq('payment_method', 'credit')
      .not('billing_date', 'is', null)
      .gte('billing_date', startISO)
      .lte('billing_date', endISO)
      .order('billing_date', { ascending: true }),
    supabase.from('pots').select('id,name').eq('user_id', userId),
  ])

  const potMap: Record<string, string> = {}
  ;((potsRes.data ?? []) as any[]).forEach((p: any) => { potMap[p.id] = p.name })

  const allTxs = [
    ...((nonCreditRes.data ?? []) as any[]).map(t => ({ ...t, displayDate: t.date })),
    ...((creditRes.data ?? []) as any[]).map(t => ({ ...t, displayDate: t.billing_date })),
  ]

  // Group by YYYY-MM of displayDate
  const byMonth: Record<string, any[]> = {}
  for (const tx of allTxs) {
    const key = (tx.displayDate as string).substring(0, 7)
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(tx)
  }
  const sortedKeys = Object.keys(byMonth).sort()

  const wb = XLSX.utils.book_new()

  // ── Resumo sheet ──
  const summaryData: any[][] = [
    ['Mês', 'Receitas (R$)', 'Despesas (R$)', 'Saldo (R$)'],
  ]
  for (const key of sortedKeys) {
    const txs = byMonth[key]
    const income = txs
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + Number(t.amount), 0)
    const expense = txs
      .filter(t => t.type !== 'income')
      .reduce((s, t) => s + Number(t.amount), 0)
    const [y, m] = key.split('-')
    summaryData.push([
      `${MONTH_SHORT[Number(m) - 1]}/${y}`,
      Number(income.toFixed(2)),
      Number(expense.toFixed(2)),
      Number((income - expense).toFixed(2)),
    ])
  }
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  summarySheet['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumo')

  // ── One sheet per month ──
  for (const key of sortedKeys) {
    const [y, m] = key.split('-')
    const sheetName = `${MONTH_SHORT[Number(m) - 1]}_${y}` // e.g. "Abr_2026"

    const rows: any[][] = [
      ['Data', 'Tipo', 'Descrição', 'Estabelecimento', 'Pote', 'Pagamento', 'Valor (R$)', 'Parcela'],
    ]

    const txs = byMonth[key].sort((a, b) =>
      (a.displayDate as string).localeCompare(b.displayDate)
    )

    for (const t of txs) {
      const tipo =
        t.type === 'income' ? 'Receita'
        : t.type === 'goal_deposit' ? 'Depósito Meta'
        : 'Despesa'
      const valor = t.type === 'income'
        ? Number(Number(t.amount).toFixed(2))
        : -Number(Number(t.amount).toFixed(2))
      const parcela =
        (t.installment_total ?? 0) > 1
          ? `${t.installment_number}/${t.installment_total}`
          : ''
      const potName = t.pot_id ? (potMap[t.pot_id] ?? '') : ''
      const pgto = PAYMENT_LABELS[t.payment_method] ?? t.payment_method ?? ''

      rows.push([
        formatDate(t.displayDate),
        tipo,
        t.description ?? '',
        t.merchant ?? '',
        potName,
        pgto,
        valor,
        parcela,
      ])
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [
      { wch: 12 }, { wch: 14 }, { wch: 32 }, { wch: 22 },
      { wch: 18 }, { wch: 18 }, { wch: 13 }, { wch: 8 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
  const filename = `SnapGestao_${filenameLabel}.xlsx`
  const path = (FileSystem.cacheDirectory ?? '') + filename
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const canShare = await Sharing.isAvailableAsync()
  if (canShare) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: `Exportar ${filenameLabel}`,
      UTI: 'com.microsoft.excel.xlsx',
    })
  }
}

// ── Period helpers (used by modal) ──

export type Preset = 'ultimos3' | 'ultimos6' | 'anoAtual' | 'anoAnterior' | 'personalizado'

export function getPeriodISO(
  preset: Preset,
  customStart: MonthYear,
  customEnd: MonthYear,
): { startISO: string; endISO: string; label: string } {
  const now = new Date()
  const curYear = now.getFullYear()
  const curMonth = now.getMonth() + 1

  if (preset === 'ultimos3') {
    const s = addMonths({ year: curYear, month: curMonth }, -2)
    return {
      startISO: `${s.year}-${pad(s.month)}-01`,
      endISO: lastDayISO(curYear, curMonth),
      label: 'Ultimos_3m',
    }
  }
  if (preset === 'ultimos6') {
    const s = addMonths({ year: curYear, month: curMonth }, -5)
    return {
      startISO: `${s.year}-${pad(s.month)}-01`,
      endISO: lastDayISO(curYear, curMonth),
      label: 'Ultimos_6m',
    }
  }
  if (preset === 'anoAtual') {
    return {
      startISO: `${curYear}-01-01`,
      endISO: `${curYear}-12-31`,
      label: `${curYear}`,
    }
  }
  if (preset === 'anoAnterior') {
    return {
      startISO: `${curYear - 1}-01-01`,
      endISO: `${curYear - 1}-12-31`,
      label: `${curYear - 1}`,
    }
  }
  // personalizado
  return {
    startISO: `${customStart.year}-${pad(customStart.month)}-01`,
    endISO: lastDayISO(customEnd.year, customEnd.month),
    label: `${MONTH_SHORT[customStart.month - 1]}${customStart.year}_${MONTH_SHORT[customEnd.month - 1]}${customEnd.year}`,
  }
}
