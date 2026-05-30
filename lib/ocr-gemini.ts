/**
 * OCR via Gemini Vision — detecta e extrai dados de documentos financeiros.
 * Gemini reabilitado APENAS para OCR; Mentor e Analisador continuam Claude/Groq.
 * Suporta: cupom fiscal, nota de serviço, nota de compra, comprovantes Pix/TED/cartão,
 * recibos e faturas (água, luz, internet).
 */

import { ReceiptDocumentType } from '../types'

export const GEMINI_OCR_MODEL = 'gemini-2.5-flash'

export type GeminiOCRItem = {
  name: string
  qty: number | null
  unit_price: number | null
  total: number
}

export type GeminiOCRResult = {
  document_type: ReceiptDocumentType
  confidence: number
  merchant: string | null
  cnpj: string | null
  cpf: string | null
  date: string | null          // DD/MM/AAAA
  time: string | null
  total: number | null
  subtotal: number | null
  discount: number | null
  tax: number | null
  items: GeminiOCRItem[]
  payment_method: 'dinheiro' | 'debito' | 'credito' | 'pix' | 'transferencia' | null
  installments: number | null
  pix_key: string | null
  pix_end_to_end: string | null
  bank_origin: string | null
  bank_destination: string | null
  recipient_name: string | null
  service_description: string | null
  competence_period: string | null
  access_key: string | null    // chave de 44 dígitos da NF-e
  notes: string | null
}

const PROMPT_OCR = `
⚠️ REGRA CRÍTICA: Datas SEMPRE no formato DD/MM/AAAA.
NUNCA use YYYY-MM-DD nem MM/DD/YYYY.
Exemplo correto: 12/05/2026
Exemplo ERRADO: 2026-05-12 ou 2026-12-05

Você é um especialista em documentos fiscais brasileiros.

Analise este documento e identifique o tipo:
- cupom_fiscal: Cupom NFC-e ou CF-e (emitido em lojas/mercados, lista de itens simples)
- nota_compra: DANFE / NF-e (Documento Auxiliar da Nota Fiscal Eletrônica — tem campos EMITENTE, DESTINATÁRIO/REMETENTE, DADOS DO PRODUTO/SERVIÇO, CÁLCULO DO IMPOSTO)
- nota_servico: NFS-e (Nota Fiscal de Serviço Eletrônica — tem DISCRIMINAÇÃO DOS SERVIÇOS)
- comprovante_pix: Comprovante de pagamento via Pix
- comprovante_ted: Comprovante TED ou DOC bancário
- comprovante_cartao: Comprovante de maquininha (crédito/débito)
- recibo: Recibo simples ou informal
- fatura: Fatura de conta (água, luz, gás, internet, telefone)
- desconhecido: Não identificado

INSTRUÇÕES PARA DANFE/NF-e (nota_compra):
- merchant = campo "IDENTIFICAÇÃO DO EMITENTE" — razão social do EMITENTE (quem vendeu)
- cnpj = CNPJ do EMITENTE (não do destinatário)
- date = campo "DATA DE EMISSÃO" — formato OBRIGATÓRIO DD/MM/AAAA
- total = campo "VALOR TOTAL DA NOTA" ou "VALOR TOTAL DOS PRODUTOS"
- payment_method = extrair de "DADOS ADICIONAIS" ou "INFORMAÇÕES COMPLEMENTARES":
  - se contiver "CARTAO" → "credito"
  - se contiver "PIX" → "pix"
  - se contiver "DINHEIRO" ou "AVISTA" → "dinheiro"
  - se contiver "BOLETO" ou "DUPLICATA" → "transferencia"
- items = tabela "DADOS DO PRODUTO/SERVIÇO" — cada linha é um item com:
  - name = DESCRIÇÃO DO PRODUTO/SERVIÇO
  - qty = QUANT.
  - unit_price = VALOR UNITÁRIO
  - total = VALOR TOTAL

INSTRUÇÕES PARA NFS-e (nota_servico):
- merchant = prestador do serviço
- service_description = campo "DISCRIMINAÇÃO DOS SERVIÇOS"
- competence_period = mês/ano de competência no formato MM/AAAA

REGRAS OBRIGATÓRIAS — NUNCA VIOLAR:
1. Datas SEMPRE no formato DD/MM/AAAA — NUNCA YYYY-MM-DD nem MM/DD/YYYY
2. CNPJ SEMPRE no formato XX.XXX.XXX/XXXX-XX
3. Valores SEMPRE como número sem símbolo (ex: 410.52 e não "R$ 410,52")
4. Vírgula decimal brasileira deve ser convertida para ponto (410,52 → 410.52)
5. Se um campo não estiver visível, retornar null
6. Retornar APENAS JSON válido — sem markdown, sem texto, sem explicações

{
  "document_type": "string",
  "confidence": 0.95,
  "merchant": "razão social do emitente",
  "cnpj": "XX.XXX.XXX/XXXX-XX",
  "cpf": null,
  "date": "DD/MM/AAAA",
  "time": "HH:MM ou null",
  "total": 410.52,
  "subtotal": null,
  "discount": null,
  "tax": null,
  "items": [
    {
      "name": "descrição do produto",
      "qty": 6,
      "unit_price": 29.88,
      "total": 179.28
    }
  ],
  "payment_method": "credito",
  "installments": null,
  "service_description": null,
  "competence_period": null,
  "access_key": "44 dígitos ou null",
  "recipient_name": "razão social do destinatário ou null",
  "pix_key": null,
  "pix_end_to_end": null,
  "bank_origin": null,
  "bank_destination": null,
  "notes": null
}
`

const FALLBACK_RESULT: GeminiOCRResult = {
  document_type: 'desconhecido',
  confidence: 0,
  merchant: null,
  cnpj: null,
  cpf: null,
  date: null,
  time: null,
  total: null,
  subtotal: null,
  discount: null,
  tax: null,
  items: [],
  payment_method: null,
  installments: null,
  pix_key: null,
  pix_end_to_end: null,
  bank_origin: null,
  bank_destination: null,
  recipient_name: null,
  service_description: null,
  competence_period: null,
  access_key: null,
  notes: null,
}

export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  // YYYY-MM-DD → DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
  }
  // YYYY/MM/DD → DD/MM/YYYY
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
    const [y, m, d] = s.split('/')
    return `${d}/${m}/${y}`
  }
  // DD/MM/YYYY — já correto, não mexer
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
  return s
}

const PROMPT_PDF_TEST = `
⚠️ REGRA CRÍTICA: Datas SEMPRE no formato DD/MM/AAAA.
NUNCA use YYYY-MM-DD nem MM/DD/YYYY.
Exemplo correto: 12/05/2026
Exemplo ERRADO: 2026-05-12 ou 2026-12-05

Analise este DANFE (Nota Fiscal Eletrônica brasileira) e extraia em JSON:
{
  "document_type": "nota_compra",
  "confidence": 0.9,
  "merchant": "nome do emitente",
  "cnpj": "CNPJ do emitente",
  "date": "data de emissão DD/MM/AAAA",
  "total": 0,
  "items": [{"name": "descrição", "qty": 1, "unit_price": 0, "total": 0}],
  "payment_method": "credito ou pix ou dinheiro",
  "recipient_name": "nome do destinatário",
  "access_key": "chave de 44 dígitos",
  "service_description": null,
  "competence_period": null,
  "cpf": null,
  "time": null,
  "subtotal": null,
  "discount": null,
  "tax": null,
  "installments": null,
  "pix_key": null,
  "pix_end_to_end": null,
  "bank_origin": null,
  "bank_destination": null,
  "notes": null
}
Retorne APENAS o JSON, sem markdown.
`

export async function analyzeReceiptWithGemini(
  base64Image: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' = 'image/jpeg'
): Promise<GeminiOCRResult> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
  if (!apiKey) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY não configurada.')

  const isPDF = mimeType === 'application/pdf'
  const model = GEMINI_OCR_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  const startTime = Date.now()

  const prompt = isPDF ? PROMPT_PDF_TEST : PROMPT_OCR

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Image } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  }

  if (isPDF) {
    const inlineData = (body.contents[0].parts[0] as { inline_data: { mime_type: string; data: string } }).inline_data
    console.log('[Gemini PDF] iniciando chamada ao modelo', model)
    console.log('[Gemini PDF] body keys:', Object.keys(body))
    console.log('[Gemini PDF] mime_type:', inlineData.mime_type)
    console.log('[Gemini PDF] data length:', inlineData.data.length)
    console.log('[Gemini PDF] data prefix:', inlineData.data.slice(0, 20))
    console.log('[Gemini PDF] prompt length:', prompt.length)
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    })
  } catch (e: any) {
    clearTimeout(timeoutId)
    if (e?.name === 'AbortError') throw new Error('Tempo limite excedido. Tente novamente.')
    throw e
  }
  clearTimeout(timeoutId)

  if (isPDF) {
    console.log('[Gemini PDF] resposta em', Date.now() - startTime, 'ms | status', response.status)
  }

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API ${response.status}: ${err}`)
  }

  const responseData = await response.json()

  if (isPDF) {
    console.log('[Gemini PDF] candidates count:', responseData?.candidates?.length)
    console.log('[Gemini PDF] finish reason:', responseData?.candidates?.[0]?.finishReason)
    console.log('[Gemini PDF] safety ratings:', JSON.stringify(responseData?.candidates?.[0]?.safetyRatings))
  }

  const text: string = responseData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  if (isPDF) {
    console.log('[Gemini PDF] raw response length:', text.length)
    console.log('[Gemini PDF] raw response FULL:', text)
  }

  // Extract JSON — Gemini may wrap in markdown code blocks
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { ...FALLBACK_RESULT }

  try {
    const p = JSON.parse(jsonMatch[0])
    const normalizedDate = normalizeDate(p.date ?? null)
    if (isPDF) console.log('[Gemini OCR] date raw:', p.date, '→ normalizado:', normalizedDate)
    return {
      document_type: (p.document_type as ReceiptDocumentType) ?? 'desconhecido',
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      merchant: p.merchant ?? null,
      cnpj: p.cnpj ?? null,
      cpf: p.cpf ?? null,
      date: normalizedDate,
      time: p.time ?? null,
      total: typeof p.total === 'number' ? p.total : null,
      subtotal: typeof p.subtotal === 'number' ? p.subtotal : null,
      discount: typeof p.discount === 'number' ? p.discount : null,
      tax: typeof p.tax === 'number' ? p.tax : null,
      items: Array.isArray(p.items) ? p.items : [],
      payment_method: p.payment_method ?? null,
      installments: typeof p.installments === 'number' ? p.installments : null,
      pix_key: p.pix_key ?? null,
      pix_end_to_end: p.pix_end_to_end ?? null,
      bank_origin: p.bank_origin ?? null,
      bank_destination: p.bank_destination ?? null,
      recipient_name: p.recipient_name ?? null,
      service_description: p.service_description ?? null,
      competence_period: p.competence_period ?? null,
      access_key: typeof p.access_key === 'string' ? p.access_key : null,
      notes: p.notes ?? null,
    }
  } catch {
    return { ...FALLBACK_RESULT }
  }
}
