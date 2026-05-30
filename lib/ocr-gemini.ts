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
  notes: string | null
}

const PROMPT_OCR = `Você é um especialista em documentos financeiros brasileiros.

Analise esta imagem e identifique o tipo de documento:
- cupom_fiscal: Cupom NFC-e ou CF-e de estabelecimento comercial
- nota_servico: Nota Fiscal de Serviço (NFS-e) de prestador
- nota_compra: Nota Fiscal de Produto (NF-e)
- comprovante_pix: Comprovante de pagamento via Pix
- comprovante_ted: Comprovante de transferência TED ou DOC
- comprovante_cartao: Comprovante de maquininha (crédito/débito)
- recibo: Recibo simples ou informal
- fatura: Fatura de conta (água, luz, gás, internet, telefone)
- desconhecido: Não foi possível identificar

Extraia os dados disponíveis conforme o tipo identificado.

Retorne APENAS JSON válido, sem texto adicional, markdown ou explicações:

{
  "document_type": "string (um dos tipos acima)",
  "confidence": 0.0,

  "merchant": "nome do estabelecimento/prestador ou null",
  "cnpj": "XX.XXX.XXX/XXXX-XX ou null",
  "cpf": "CPF do prestador se pessoa física ou null",
  "date": "DD/MM/AAAA ou null",
  "time": "HH:MM ou null",

  "total": null,
  "subtotal": null,
  "discount": null,
  "tax": null,

  "items": [
    {
      "name": "descrição do item/serviço",
      "qty": null,
      "unit_price": null,
      "total": 0
    }
  ],

  "payment_method": "dinheiro|debito|credito|pix|transferencia|null",
  "installments": null,

  "pix_key": "chave pix do destinatário ou null",
  "pix_end_to_end": "ID da transação pix ou null",
  "bank_origin": "banco de origem ou null",
  "bank_destination": "banco de destino ou null",
  "recipient_name": "nome do destinatário ou null",

  "service_description": "descrição do serviço para notas de serviço ou null",
  "competence_period": "período de competência (mês/ano) ou null",

  "notes": "observações relevantes ou null"
}`

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
  notes: null,
}

export async function analyzeReceiptWithGemini(
  base64Image: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' = 'image/jpeg'
): Promise<GeminiOCRResult> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
  if (!apiKey) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY não configurada.')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_OCR_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Image } },
            { text: PROMPT_OCR },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API ${response.status}: ${err}`)
  }

  const data = await response.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // Extract JSON — Gemini may wrap in markdown code blocks
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { ...FALLBACK_RESULT }

  try {
    const p = JSON.parse(jsonMatch[0])
    return {
      document_type: (p.document_type as ReceiptDocumentType) ?? 'desconhecido',
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      merchant: p.merchant ?? null,
      cnpj: p.cnpj ?? null,
      cpf: p.cpf ?? null,
      date: p.date ?? null,
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
      notes: p.notes ?? null,
    }
  } catch {
    return { ...FALLBACK_RESULT }
  }
}
