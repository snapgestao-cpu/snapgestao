/**
 * Extração de extrato/fatura bancária via IA (Gemini).
 *
 * Substitui o antigo parser determinístico por banco (regex + Edge Function
 * unpdf). Manda o PDF direto pro Gemini via inline_data (mesmo padrão de
 * lib/ocr-gemini.ts → analyzeReceiptWithGemini), chamada client-side com
 * EXPO_PUBLIC_GEMINI_API_KEY — sem biblioteca de extração de texto nem
 * Edge Function.
 *
 * Vantagem: não precisa de manutenção por banco. O modelo lê qualquer layout.
 */

import { GEMINI_OCR_MODEL, normalizeDate } from './ocr-gemini'

export type StatementType = 'debito' | 'credito'

export type BankStatementTxn = {
  date: string                 // DD/MM/AAAA
  description: string
  merchant: string
  amount: number
  type: 'expense' | 'income'
  paymentMethod: 'pix' | 'debit' | 'credit' | 'transfer' | 'cash'
  installmentTotal: 1          // extrato/fatura: lançamento já cobrado, nunca parcelar de novo
  isCreditCardBillPayment: boolean
}

export type BankStatementResult = {
  bank: string | null          // banco identificado (informativo — só exibido)
  declaredTotal: number | null // total/saldo final impresso no documento
  transactions: BankStatementTxn[]
}

const VALID_PAYMENT = new Set(['pix', 'debit', 'credit', 'transfer', 'cash'])

function toNumber(raw: any): number {
  if (typeof raw === 'number') return raw
  if (raw == null) return 0
  let s = String(raw).replace(/[R$\s]/g, '')
  // formato BR: 1.234,56 → 1234.56
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function buildPrompt(statementType: StatementType): string {
  const isCredito = statementType === 'credito'
  const contexto = isCredito
    ? 'Este documento é uma FATURA DE CARTÃO DE CRÉDITO. Cada lançamento é uma compra (type "expense") ou um estorno/crédito na fatura (type "income", ex: valor seguido de sinal negativo). paymentMethod das compras é sempre "credit".'
    : 'Este documento é um EXTRATO DE CONTA CORRENTE (débito). Cada linha é uma entrada (type "income": PIX recebido, depósito, TED recebida, estorno) ou uma saída (type "expense": PIX enviado, compra no débito, pagamento, tarifa).'

  return `
Você é um especialista em documentos bancários brasileiros. ${contexto}

⚠️ REGRAS CRÍTICAS (dado financeiro — precisão absoluta):
1. Extraia TODOS os lançamentos, SEM PULAR NENHUM. Percorra o documento inteiro, todas as páginas. Não resuma, não agrupe, não omita linhas por parecerem repetidas.
2. Datas SEMPRE no formato DD/MM/AAAA. NUNCA use AAAA-MM-DD nem MM/DD/AAAA.
3. Valores SEMPRE como número com ponto decimal (ex: 141.00), NUNCA "R$ 141,00" nem "141,00".
4. Retorne APENAS JSON válido — sem markdown, sem comentários, sem texto fora do JSON.

Identifique o banco pelo cabeçalho/logo (campo "bank" — apenas informativo).

Para CADA lançamento retorne:
- "date": data do lançamento em DD/MM/AAAA.
- "description": descrição do lançamento (estabelecimento/contraparte). Se for compra PARCELADA no crédito (ex: sufixo "04/12"), anexe " (N/T)" ao final da descrição — ex: "LOJA X (04/12)". NÃO tente parcelar no app: é uma parcela já cobrada neste mês.
- "merchant": mesmo estabelecimento/contraparte, sem o sufixo de parcela.
- "amount": valor absoluto do lançamento (número positivo, ponto decimal).
- "type": "expense" (saída/débito/compra) ou "income" (entrada/crédito/estorno).
- "paymentMethod": um de "pix" | "debit" | "credit" | "transfer" | "cash".
  - "pix": qualquer PIX (recebido, enviado, QR code, devolução).
  - "debit": compra no cartão de débito.
  - "credit": lançamento de fatura de cartão de crédito.
  - "transfer": TED, DOC, pagamento eletrônico, boleto, tributo, conta (telefone/luz), depósito.
  - "cash": dinheiro/saque.
- "installmentTotal": SEMPRE 1.
- "isCreditCardBillPayment": true APENAS quando a linha for claramente o PAGAMENTO AGREGADO da fatura de cartão de crédito sendo debitado da conta corrente (ex: descrições como "GASTOS CARTAO DE CREDITO", "PAGAMENTO FATURA CARTAO", "GASTOS CARTAO CREDITO"). Nos demais casos, false.

EXCLUA (NÃO inclua no array de transações):
- Linhas de "pagamento da fatura anterior via débito em conta" DENTRO da própria fatura de cartão de crédito (ex: "PAGTO POR DEB EM C/C", "PAGAMENTO DEBITO AUTOMATICO"). Isso é quitação, não é gasto — nunca inclua.
- Linhas de saldo/subtotais/total/cabeçalho de tabela que não sejam lançamentos reais.

Retorne também "declaredTotal": o total da fatura (crédito) ou o saldo final do período (débito) impresso no documento — número com ponto decimal, ou null se não achar.

Formato de saída EXATO:
{
  "bank": "nome do banco ou null",
  "declaredTotal": 4625.77,
  "transactions": [
    {
      "date": "DD/MM/AAAA",
      "description": "string",
      "merchant": "string",
      "amount": 0.00,
      "type": "expense",
      "paymentMethod": "credit",
      "installmentTotal": 1,
      "isCreditCardBillPayment": false
    }
  ]
}
`
}

export async function extractBankStatementWithGemini(
  base64Pdf: string,
  statementType: StatementType,
): Promise<BankStatementResult> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
  console.log('[Gemini Extrato] API key disponível:', !!apiKey)
  if (!apiKey) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY não configurada.')

  const model = GEMINI_OCR_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  // Extrato tem MUITOS itens — timeout e maxOutputTokens bem mais altos que o OCR de cupom.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 180_000)
  const startTime = Date.now()

  const prompt = buildPrompt(statementType)

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: base64Pdf } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
    },
  }

  console.log('[Gemini Extrato] iniciando', model, '| tipo:', statementType, '| pdf b64 len:', base64Pdf.length)

  // 503/429 são transitórios (modelo sobrecarregado) — retentar dentro do
  // mesmo orçamento de tempo (o 503 volta rápido, sobra tempo pra geração).
  let response: Response
  const MAX_ATTEMPTS = 3
  let attempt = 0
  while (true) {
    attempt++
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      })
    } catch (e: any) {
      clearTimeout(timeoutId)
      if (e?.name === 'AbortError') throw new Error('Tempo limite excedido ao ler o extrato. Tente novamente.')
      throw e
    }

    console.log(`[Gemini Extrato] tentativa ${attempt} em`, Date.now() - startTime, 'ms | status', response.status)

    if ((response.status === 503 || response.status === 429) && attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 3000 * attempt))
      continue
    }
    break
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    const err = await response.text()
    if (response.status === 503 || response.status === 429) {
      throw new Error('O serviço de IA está sobrecarregado no momento. Tente novamente em instantes.')
    }
    throw new Error(`Gemini API ${response.status}: ${err}`)
  }

  const responseData = await response.json()
  const finishReason = responseData?.candidates?.[0]?.finishReason
  const text: string = responseData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  console.log('[Gemini Extrato] finishReason:', finishReason, '| raw len:', text.length)

  if (finishReason === 'MAX_TOKENS') {
    throw new Error('O extrato é grande demais para processar de uma vez. Tente um período menor.')
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Não foi possível interpretar a resposta da IA para este extrato.')

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('Resposta da IA veio incompleta/inválida. Tente novamente.')
  }

  const rawTxns: any[] = Array.isArray(parsed?.transactions) ? parsed.transactions : []

  const transactions: BankStatementTxn[] = rawTxns
    .map((t): BankStatementTxn => {
      const type: 'expense' | 'income' = t?.type === 'income' ? 'income' : 'expense'
      const pmRaw = String(t?.paymentMethod ?? '').toLowerCase()
      const paymentMethod = (VALID_PAYMENT.has(pmRaw) ? pmRaw : (statementType === 'credito' ? 'credit' : 'debit')) as BankStatementTxn['paymentMethod']
      return {
        date: normalizeDate(t?.date) ?? '',
        description: String(t?.description ?? '').trim() || 'Importado',
        merchant: String(t?.merchant ?? t?.description ?? '').trim(),
        amount: Math.abs(toNumber(t?.amount)),
        type,
        paymentMethod,
        installmentTotal: 1,
        isCreditCardBillPayment: t?.isCreditCardBillPayment === true,
      }
    })
    .filter(t => t.amount > 0)

  return {
    bank: parsed?.bank ? String(parsed.bank) : null,
    declaredTotal: parsed?.declaredTotal != null ? toNumber(parsed.declaredTotal) : null,
    transactions,
  }
}
