export type TransactionGroup = {
  key: string
  merchant: string | null
  date: string
  _createdHour: string | null
  transactions: any[]
}

export function groupTransactionsByMerchantAndDate(transactions: any[]): TransactionGroup[] {
  const withDisplayDate = transactions.map(t => ({
    ...t,
    _displayDate: t.payment_method === 'credit' && t.billing_date ? t.billing_date : t.date,
    // minuto de criação no banco — ex: "2026-05-02T14:35" (precisão por minuto)
    _createdHour: t.created_at ? (t.created_at as string).substring(0, 16) : null,
  }))

  const sorted = [...withDisplayDate].sort((a, b) => {
    if (b._displayDate !== a._displayDate) return b._displayDate.localeCompare(a._displayDate)
    return (b.created_at || '').localeCompare(a.created_at || '')
  })

  const groups: TransactionGroup[] = []

  for (const t of sorted) {
    const merchant = t.merchant || null
    const date = t._displayDate
    const createdHour = t._createdHour

    if (!merchant) {
      groups.push({ key: `no-merchant-${t.id}`, merchant: null, date, _createdHour: createdHour, transactions: [t] })
      continue
    }

    const existing = groups.find(g =>
      g.merchant === merchant &&
      g.date === date &&
      g._createdHour === createdHour
    )
    if (existing) {
      existing.transactions.push(t)
    } else {
      groups.push({ key: `${merchant}-${date}-${createdHour ?? groups.length}`, merchant, date, _createdHour: createdHour, transactions: [t] })
    }
  }

  return groups
}

export function groupByDate(groups: TransactionGroup[]): Record<string, TransactionGroup[]> {
  const byDate: Record<string, TransactionGroup[]> = {}
  for (const group of groups) {
    if (!byDate[group.date]) byDate[group.date] = []
    byDate[group.date].push(group)
  }
  return byDate
}

export function formatDateHeader(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  if (dateStr === today) return 'Hoje'
  if (dateStr === yesterday) return 'Ontem'

  const date = new Date(dateStr + 'T12:00:00')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${date.getDate()} ${months[date.getMonth()]}`
}
