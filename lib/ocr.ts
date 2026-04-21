import { supabase } from './supabase'
import * as ImagePicker from 'expo-image-picker'
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy'

export type OCRItem = { name: string; value: number }

export type NFCeItem = {
  name: string
  quantity: number
  unit: string
  unitValue: number
  totalValue: number
}

export type NFCeResult = {
  success: boolean
  source: 'sefaz_rj' | 'ocr'
  merchant?: string
  cnpj?: string
  emission_date?: string
  items?: NFCeItem[]
  total?: number
  payment_method?: string
  error?: string
}

// Edge Function route — kept for reference but not used (datacenter IP blocked by SEFAZ)
export async function fetchNFCeFromURL(url: string): Promise<NFCeResult> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-nfce', {
      body: { url },
    })
    if (error) throw error
    return data as NFCeResult
  } catch (err) {
    return { success: false, source: 'sefaz_rj', error: String(err) }
  }
}

// Device-side fetch — uses the user's mobile IP, not blocked by SEFAZ
export async function fetchNFCeFromDevice(url: string): Promise<NFCeResult> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cache-Control': 'no-cache',
      },
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const html = await response.text()
    return parseNFCeHTML(html, url)
  } catch (err) {
    return { success: false, source: 'sefaz_rj', error: String(err) }
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseBRL(s: string): number {
  // "1.234,56" → 1234.56
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

function parseNFCeHTML(html: string, url: string): NFCeResult {
  // ── ESTABELECIMENTO ──
  let merchant = 'Não identificado'
  const h4Match = html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)
  if (h4Match) merchant = stripTags(h4Match[1]).trim()
  if (!merchant || merchant === 'Não identificado') {
    const spanCenterMatch = html.match(
      /<div[^>]*class="[^"]*text-center[^"]*"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i
    )
    if (spanCenterMatch) merchant = stripTags(spanCenterMatch[1]).trim()
  }

  // ── CNPJ ──
  const cnpjMatch = html.match(
    /(\d{2}[\.\-\/]?\d{3}[\.\-\/]?\d{3}[\.\-\/]?\d{4}[\.\-\/]?\d{2})/
  )
  const cnpj = cnpjMatch?.[1]?.replace(/\D/g, '') || null

  // ── DATA ──
  const dateMatch = html.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  const emission_date = dateMatch
    ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
    : new Date().toISOString().split('T')[0]

  const items: NFCeItem[] = []

  // ── ITENS: Padrão 1 — table#tblItens ──
  const tblMatch = html.match(/id=["']tblItens["'][^>]*>([\s\S]*?)<\/table>/i)
  if (tblMatch) {
    const rows = tblMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || []
    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(td => stripTags(td))
        .filter(Boolean)
      if (cells.length >= 2) {
        const val = parseBRL(cells[cells.length - 1])
        if (val > 0 && val < 100000) {
          const qty = cells.length >= 4 ? (parseFloat(cells[1].replace(',', '.')) || 1) : 1
          items.push({
            name: cells[0],
            quantity: qty,
            unit: cells.length >= 4 ? (cells[2] || 'UN') : 'UN',
            unitValue: val / qty,
            totalValue: val,
          })
        }
      }
    }
  }

  // ── ITENS: Padrão 2 — divs com classe "item" ou "produto" ──
  if (items.length === 0) {
    const divRegex = /<div[^>]*class="[^"]*(?:item|produto)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
    let dm
    while ((dm = divRegex.exec(html)) !== null) {
      const text = stripTags(dm[1])
      const valMatch = text.match(/([\d]+[,\.]\d{2})\s*$/)
      if (valMatch) {
        const val = parseBRL(valMatch[1])
        if (val > 0) {
          items.push({
            name: text.replace(valMatch[0], '').trim(),
            quantity: 1, unit: 'UN',
            unitValue: val, totalValue: val,
          })
        }
      }
    }
  }

  // ── ITENS: Padrão 3 — texto puro linha a linha ──
  if (items.length === 0) {
    const text = stripTags(html)
    const lines = text.split(/\s{2,}|\n|\r/).map(l => l.trim()).filter(l => l.length > 2)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Linha de produto: começa com letra maiúscula, tem ao menos 5 chars, sem número no início
      if (
        /^[A-ZÁÉÍÓÚÃÕÇÀÈÌ]/i.test(line) &&
        line.length >= 5 &&
        !/^\d/.test(line) &&
        /[A-Z]{3,}/i.test(line)
      ) {
        let totalVal = 0
        let qty = 1
        let unit = 'UN'

        // Busca nas próximas 4 linhas
        for (let j = 1; j <= 4 && i + j < lines.length; j++) {
          const next = lines[i + j]
          const qtdeM = next.match(/Qtde\.?:?\s*([\d,\.]+)/i)
          const unitM = next.match(/UN:?\s*(\w+)/i)
          const totalM = next.match(/(?:Vl\.?\s*[Tt]otal|Total)\s*R?\$?\s*([\d\.,]+)/i)
          const unitValM = next.match(/Vl\.?\s*[Uu]nit\.?:?\s*([\d\.,]+)/i)

          if (qtdeM) qty = parseFloat(qtdeM[1].replace(',', '.')) || 1
          if (unitM) unit = unitM[1]
          if (totalM) {
            totalVal = parseBRL(totalM[1])
          } else if (unitValM && qty > 0) {
            totalVal = parseBRL(unitValM[1]) * qty
          }
        }

        if (totalVal > 0 && totalVal < 100000) {
          items.push({
            name: line,
            quantity: qty,
            unit,
            unitValue: totalVal / qty,
            totalValue: totalVal,
          })
        }
      }
    }
  }

  if (items.length === 0) {
    console.log('=== parseNFCeHTML: sem itens — HTML debug ===')
    console.log(html.substring(0, 5000))
    console.log('=== FIM HTML ===')
  }

  // ── TOTAL ──
  const totalMatch =
    html.match(/Valor\s+[Aa]\s+[Pp]agar[^>]*>[^<]*<[^>]+>\s*([\d\.,]+)/i) ||
    html.match(/Valor\s+a\s+pagar[^R]*R\$\s*([\d\.,]+)/i) ||
    html.match(/Total\s*R?\$?\s*:?\s*([\d\.,]+)/i)
  const total = totalMatch
    ? parseBRL(totalMatch[1])
    : items.reduce((s, it) => s + it.totalValue, 0)

  // ── FORMA DE PAGAMENTO ──
  let payment_method: NFCeResult['payment_method'] = 'debit'
  if (/d[eé]bito/i.test(html)) payment_method = 'debit'
  else if (/cr[eé]dito/i.test(html)) payment_method = 'credit'
  else if (/pix/i.test(html)) payment_method = 'pix'
  else if (/dinheiro|esp[eé]cie/i.test(html)) payment_method = 'cash'

  return {
    success: items.length > 0,
    source: 'sefaz_rj',
    merchant: merchant.substring(0, 100),
    cnpj,
    emission_date,
    items,
    total,
    payment_method,
    error: items.length === 0 ? 'Não foi possível extrair os itens do cupom' : undefined,
  }
}

export type OCRResult = {
  success: boolean
  receipt_id?: string
  merchant?: string
  total?: number
  receipt_date?: string
  items?: OCRItem[]
  image_url?: string
  raw_text?: string
  error?: string
}

export async function imageToBase64(uri: string): Promise<string> {
  return readAsStringAsync(uri, { encoding: EncodingType.Base64 })
}

// Legacy alias used by OCRCamera.tsx
export async function extractReceiptData(base64Image: string): Promise<OCRResult> {
  return { success: false, error: 'Use processReceipt() instead.' }
}

export async function processReceipt(imageUri: string, userId: string): Promise<OCRResult> {
  try {
    const base64 = await imageToBase64(imageUri)
    const { data, error } = await supabase.functions.invoke('process-receipt', {
      body: { imageBase64: base64, userId },
    })
    if (error) throw error
    return { ...(data as OCRResult), success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function captureReceipt(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync()
  if (status !== 'granted') return null
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    base64: false,
  })
  if (result.canceled) return null
  return result.assets[0].uri
}

export async function pickReceiptFromGallery(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== 'granted') return null
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  })
  if (result.canceled) return null
  return result.assets[0].uri
}
