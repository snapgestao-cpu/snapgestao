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
Você é um especialista em documentos fiscais brasileiros.

Analise esta imagem/documento e identifique o tipo:
- cupom_fiscal: Cupom NFC-e ou CF-e (emitido em lojas/mercados)
- nota_compra: NF-e / DANFE (Nota Fiscal Eletrônica de produto)
- nota_servico: NFS-e (Nota Fiscal de Serviço Eletrônica)
- comprovante_pix: Comprovante de pagamento via Pix
- comprovante_ted: Comprovante TED ou DOC bancário
- comprovante_cartao: Comprovante de maquininha (crédito/débito)
- recibo: Recibo simples ou informal
- fatura: Fatura de conta (água, luz, gás, internet, telefone)
- desconhecido: Não foi possível identificar

INSTRUÇÕES ESPECÍFICAS POR TIPO:

Para NF-e / DANFE (nota_compra):
- Emitente = campo "EMITENTE" ou "NOME/RAZÃO SOCIAL" do emissor
- CNPJ do emitente está no campo "CNPJ" da seção emitente
- Data de emissão está em "DATA DE EMISSÃO" ou "DHEMI" — formato DD/MM/AAAA
- Itens estão na tabela "DADOS DOS PRODUTOS E SERVIÇOS"
- Valor total está em "VALOR TOTAL DA NOTA" ou "TOTAL DA NF-e"
- Chave de acesso tem 44 dígitos numéricos

Para NFS-e (nota_servico):
- Prestador = empresa que prestou o serviço
- Tomador = empresa/pessoa que contratou
- Descrição do serviço = campo "DISCRIMINAÇÃO DOS SERVIÇOS"
- Valor = "VALOR LÍQUIDO DA NOTA" ou "VALOR DOS SERVIÇOS"
- Competência = mês/ano de referência do serviço

Para cupom_fiscal (NFC-e):
- Emitente = nome do estabelecimento no topo
- Itens = lista de produtos com código, descrição, qtd, valor
- Total = "TOTAL" ou "VALOR A PAGAR"

REGRAS OBRIGATÓRIAS:
- Datas SEMPRE no formato DD/MM/AAAA
- CNPJ SEMPRE no formato XX.XXX.XXX/XXXX-XX
- Valores SEMPRE como número (ex: 150.90, não "R$ 150,90")
- Se um campo não estiver visível, retornar null

Retorne APENAS JSON válido, sem markdown, sem texto adicional:

{
  "document_type": "string",
  "confidence": 0.0,
  "merchant": "razão social do emitente/prestador ou null",
  "cnpj": "XX.XXX.XXX/XXXX-XX ou null",
  "cpf": "CPF se pessoa física ou null",
  "date": "DD/MM/AAAA ou null",
  "time": "HH:MM ou null",
  "total": null,
  "subtotal": null,
  "discount": null,
  "tax": null,
  "items": [
    {
      "name": "descrição do produto/serviço",
      "qty": null,
      "unit_price": null,
      "total": 0
    }
  ],
  "payment_method": "dinheiro|debito|credito|pix|transferencia|null",
  "installments": null,
  "service_description": "discriminação dos serviços para NFS-e ou null",
  "competence_period": "MM/AAAA ou null",
  "access_key": "chave de 44 dígitos da NF-e ou null",
  "recipient_name": "nome do destinatário/tomador ou null",
  "pix_key": null,
  "pix_end_to_end": null,
  "bank_origin": null,
  "bank_destination": null,
  "notes": "observações relevantes ou null"
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

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null
  // YYYY-MM-DD → DD/MM/AAAA
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-')
    return `${d}/${m}/${y}`
  }
  // MM/DD/YYYY — detectar: se o primeiro segmento > 12 já é DD/MM (ok), senão inverter
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [a, b, y] = raw.split('/')
    if (parseInt(a) > 12) return raw // primeiro segmento > 12 → já é DD/MM/AAAA
    return `${b}/${a}/${y}`          // formato americano → inverter
  }
  return raw
}

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
  if (isPDF) console.log('[Gemini PDF] iniciando chamada ao modelo', model)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
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
      date: normalizeDate(p.date ?? null),
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
