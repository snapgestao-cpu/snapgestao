import { supabase } from './supabase'

// null = nunca respondeu, true = aceitou, false = recusou
export async function getUserPriceShareOptIn(userId: string): Promise<boolean | null> {
  const { data } = await supabase
    .from('user_preferences')
    .select('share_price_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null
  return data.share_price_data === true ? true : false
}

export async function setUserPriceShareOptIn(userId: string, accept: boolean): Promise<void> {
  await supabase
    .from('user_preferences')
    .upsert({
      user_id: userId,
      share_price_data: accept,
      share_price_accepted_at: accept ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
}

function extractCityState(merchantText: string): { city: string | null; state: string | null } {
  const stateMatch = merchantText.match(/,\s*([A-Z]{2})\s*$/)
  const state = stateMatch ? stateMatch[1] : null

  const parts = merchantText.split(',').map(p => p.trim()).filter(Boolean)
  const city = parts.length >= 2 ? parts[parts.length - 2] : null

  return { city, state }
}

function normalizeItemName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 2)
    .join(' ')
}

export async function submitPriceData(
  items: Array<{ name: string; totalValue: number; quantity: number }>,
  merchant: string,
  merchantAddress: string,
  cnpj: string | null,
  emissionDate: string
): Promise<void> {
  const { city, state } = extractCityState(merchantAddress)

  const records = items
    .filter(item => item.totalValue > 0 && item.name && item.name.length > 2)
    .map(item => ({
      item_name: normalizeItemName(item.name),
      item_name_raw: item.name.substring(0, 200),
      price: item.quantity > 1 ? item.totalValue / item.quantity : item.totalValue,
      establishment: merchant.substring(0, 200).toUpperCase(),
      establishment_cnpj: cnpj ? cnpj.replace(/\D/g, '').substring(0, 14) : null,
      city: city?.substring(0, 100) || null,
      state: state || null,
      scanned_at: emissionDate.split('T')[0],
    }))

  if (records.length === 0) return

  const batchSize = 50
  for (let i = 0; i < records.length; i += batchSize) {
    await supabase.from('price_database').insert(records.slice(i, i + batchSize))
  }
}

export async function getPriceComparison(
  itemName: string,
  city: string | null
): Promise<Array<{
  establishment: string
  min_price: number
  avg_price: number
  max_price: number
  count: number
}>> {
  const normalized = normalizeItemName(itemName)

  let query = supabase
    .from('price_database')
    .select('establishment, price')
    .ilike('item_name', `%${normalized}%`)
    .gte(
      'scanned_at',
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    )

  if (city) query = query.ilike('city', `%${city}%`)

  const { data } = await query.limit(500)
  if (!data?.length) return []

  const grouped: Record<string, number[]> = {}
  data.forEach(row => {
    if (!grouped[row.establishment]) grouped[row.establishment] = []
    grouped[row.establishment].push(Number(row.price))
  })

  return Object.entries(grouped)
    .filter(([, prices]) => prices.length >= 1)
    .map(([establishment, prices]) => ({
      establishment,
      min_price: Math.min(...prices),
      avg_price: prices.reduce((s, p) => s + p, 0) / prices.length,
      max_price: Math.max(...prices),
      count: prices.length,
    }))
    .sort((a, b) => a.avg_price - b.avg_price)
}

export async function getUserCity(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('receipts')
    .select('merchant_address')
    .eq('user_id', userId)
    .not('merchant_address', 'is', null)
    .limit(10)

  if (!data?.length) return null

  for (const row of data) {
    const { city } = extractCityState(row.merchant_address || '')
    if (city) return city
  }

  return null
}
