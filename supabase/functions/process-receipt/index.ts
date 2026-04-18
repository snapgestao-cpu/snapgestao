import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { imageBase64, userId } = await req.json()

    if (!imageBase64 || !userId) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 e userId são obrigatórios.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    // ── 1. Call Google Cloud Vision API ─────────────────────────────────────
    const visionKey = Deno.env.get('GOOGLE_VISION_API_KEY')
    if (!visionKey) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_VISION_API_KEY não configurada.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      },
    )

    if (!visionRes.ok) {
      const err = await visionRes.text()
      return new Response(
        JSON.stringify({ error: 'Erro na Vision API: ' + err }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    const visionData = await visionRes.json()
    const rawText: string =
      visionData.responses?.[0]?.fullTextAnnotation?.text ?? ''

    // ── 2. Extract fields from raw text ─────────────────────────────────────
    const extracted = extractReceiptData(rawText)

    // ── 3. Save image to Supabase Storage (bucket: receipts) ─────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const imageBytes = base64ToUint8Array(imageBase64)
    const filename = `${userId}/${Date.now()}.jpg`

    const { error: storageErr } = await supabase.storage
      .from('receipts')
      .upload(filename, imageBytes, { contentType: 'image/jpeg', upsert: false })

    const imageUrl = storageErr
      ? null
      : `${supabaseUrl}/storage/v1/object/public/receipts/${filename}`

    // ── 4. Save receipt record to public.receipts ─────────────────────────
    const { data: receiptRow, error: dbErr } = await supabase
      .from('receipts')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        raw_text: rawText,
        merchant: extracted.merchant,
        cnpj: extracted.cnpj,
        total_amount: extracted.total,
        receipt_date: extracted.date,
        items: extracted.items,
        status: 'processed',
      })
      .select()
      .single()

    if (dbErr) {
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar recibo: ' + dbErr.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    // ── 5. Return extracted data ──────────────────────────────────────────
    return new Response(
      JSON.stringify({
        id: receiptRow.id,
        merchant: extracted.merchant,
        total: extracted.total,
        date: extracted.date,
        cnpj: extracted.cnpj,
        items: extracted.items,
        imageUrl,
        rawText,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Erro interno: ' + (e as Error).message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

type ReceiptItem = { description: string; amount: number }

type ExtractedReceipt = {
  merchant: string | null
  cnpj: string | null
  total: number | null
  date: string | null   // YYYY-MM-DD
  items: ReceiptItem[]
}

function extractReceiptData(text: string): ExtractedReceipt {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Merchant: typically the first non-empty line
  const merchant = lines[0] ?? null

  // CNPJ: pattern XX.XXX.XXX/XXXX-XX
  const cnpjMatch = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
  const cnpj = cnpjMatch ? cnpjMatch[0] : null

  // Total: look for keywords TOTAL, VALOR TOTAL, TOTAL A PAGAR followed by a BRL amount
  const totalMatch = text.match(
    /(?:TOTAL|VALOR\s+TOTAL|TOTAL\s+A\s+PAGAR)[^\d]*?([\d]+[.,][\d]{2})/i,
  )
  const total = totalMatch ? parseBRL(totalMatch[1]) : extractFallbackTotal(lines)

  // Date: DD/MM/YYYY or DD-MM-YYYY
  const dateMatch = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  let date: string | null = null
  if (dateMatch) {
    const [, d, m, y] = dateMatch
    date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Items: lines that end with a BRL-like amount and have a description prefix
  const items: ReceiptItem[] = []
  const itemRegex = /^(.+?)\s+([\d]+[.,][\d]{2})\s*$/
  for (const line of lines) {
    const m = line.match(itemRegex)
    if (!m) continue
    const desc = m[1].trim()
    const amount = parseBRL(m[2])
    // Skip lines that look like totals/tax labels
    if (/TOTAL|SUBTOTAL|DESCONTO|TROCO|TAXA|CNPJ|CPF/i.test(desc)) continue
    if (amount > 0 && desc.length > 1) {
      items.push({ description: desc, amount })
    }
  }

  return { merchant, cnpj, total, date, items }
}

function parseBRL(value: string): number {
  // Handles "1.234,56" and "1234.56"
  const normalized = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : value
  return parseFloat(normalized) || 0
}

function extractFallbackTotal(lines: string[]): number | null {
  // Walk lines in reverse looking for the largest standalone amount
  const amounts: number[] = []
  for (const line of lines) {
    const m = line.match(/([\d]+[.,][\d]{2})/)
    if (m) amounts.push(parseBRL(m[1]))
  }
  if (amounts.length === 0) return null
  return Math.max(...amounts)
}

function base64ToUint8Array(base64: string): Uint8Array {
  // Strip data URI prefix if present
  const clean = base64.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
