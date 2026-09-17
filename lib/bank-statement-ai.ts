/**
 * Extração de extrato/fatura bancária via IA (Gemini).
 *
 * Substitui o antigo parser determinístico por banco (regex + Edge Function
 * unpdf). Manda o PDF direto pro Gemini via inline_data (mesmo padrão de
 * lib/ocr-gemini.ts → analyzeReceiptWithGemini), chamada client-side com
 * EXPO_PUBLIC_GEMINI_API_KEY — sem biblioteca de extração de texto nem
 * Edge Function. Vantagem: não precisa de manutenção por banco.
 *
 * Chunking por página: documentos grandes (extrato de vários meses, 18+
 * páginas) numa chamada única davam timeout e perdiam lançamentos. Aqui o PDF
 * é dividido em blocos de poucas páginas (pdf-lib), uma chamada Gemini por
 * bloco EM PARALELO, e os resultados são mesclados. Continua 100% IA.
 */

import { PDFDocument } from 'pdf-lib'
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
  // Parcelamento DETECTADO na linha da fatura (sufixo "N/T"). Conceito diferente
  // de installmentTotal (que é sempre 1 por design). Usados para criar as parcelas
  // FUTURAS restantes (N+1..T) na importação. undefined = não é compra parcelada.
  installmentNumber?: number        // N — parcela atual
  installmentTotalDetected?: number // T — total de parcelas
}

export type BankStatementResult = {
  bank: string | null          // banco identificado (informativo — só exibido)
  declaredTotal: number | null // total/saldo final impresso no documento
  transactions: BankStatementTxn[]
}

// Separa os pagamentos AGREGADOS de fatura de cartão (isCreditCardBillPayment)
// do restante. Usado pelo fluxo de importação para o usuário escolher entre
// EXCLUIR esse valor (evita duplicar os gastos que já entram pela fatura de
// crédito) ou INCLUÍ-LO mesmo assim (remapeado para "transfer").
// Puro/sem I/O — testável isoladamente (ver __tests__/bank-statement-ai.test.ts).
export function partitionBillPayments(transactions: BankStatementTxn[]): {
  billPayments: BankStatementTxn[]
  withoutBillPayments: BankStatementTxn[]
  includedAsTransfer: BankStatementTxn[]
} {
  const billPayments = transactions.filter(t => t.isCreditCardBillPayment)
  const withoutBillPayments = transactions.filter(t => !t.isCreditCardBillPayment)
  const includedAsTransfer = transactions.map(t =>
    t.isCreditCardBillPayment ? { ...t, paymentMethod: 'transfer' as const } : t
  )
  return { billPayments, withoutBillPayments, includedAsTransfer }
}

// Nº de páginas por bloco. Documentos com até esse tamanho vão numa chamada só.
// Validado nos PDFs reais do Bradesco: 3 páginas ≈ 50 lançamentos/bloco,
// ~56-69s por bloco (dentro dos 90s). Com 6 páginas os blocos chegavam a
// 56-82s+ e estouravam o timeout em páginas densas. Extrato de 18 páginas →
// 6 blocos em paralelo, ~69s no total (antes dava timeout numa chamada só).
const CHUNK_SIZE_PAGES = 3
const CHUNK_TIMEOUT_MS = 90_000    // timeout por bloco
const SINGLE_TIMEOUT_MS = 180_000  // timeout do documento inteiro (sem chunking)

const VALID_PAYMENT = new Set(['pix', 'debit', 'credit', 'transfer', 'cash'])

type ChunkInfo = { index: number; total: number; startPage: number; endPage: number }

// Converte para inteiro positivo (parcela), ou undefined se inválido/ausente.
function toPositiveInt(raw: any): number | undefined {
  const n = Math.trunc(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function toNumber(raw: any): number {
  if (typeof raw === 'number') return raw
  if (raw == null) return 0
  let s = String(raw).replace(/[R$\s]/g, '')
  // formato BR: 1.234,56 → 1234.56
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function buildPrompt(statementType: StatementType, chunk: ChunkInfo | null): string {
  const isCredito = statementType === 'credito'
  const contexto = isCredito
    ? 'Este documento é uma FATURA DE CARTÃO DE CRÉDITO. Cada lançamento é uma compra (type "expense") ou um estorno/crédito na fatura (type "income", ex: valor seguido de sinal negativo). paymentMethod das compras é sempre "credit".'
    : 'Este documento é um EXTRATO DE CONTA CORRENTE (débito). Cada linha é uma entrada (type "income": PIX recebido, depósito, TED recebida, estorno) ou uma saída (type "expense": PIX enviado, compra no débito, pagamento, tarifa).'

  const chunkNote = chunk
    ? `\n⚠️ ATENÇÃO: Este é um TRECHO de um documento maior (parte ${chunk.index} de ${chunk.total}). Extraia APENAS os lançamentos presentes NESTE trecho, sem inventar continuação. Se o total/saldo final do documento não aparecer neste trecho, retorne "declaredTotal": null.\n`
    : ''

  return `
Você é um especialista em documentos bancários brasileiros. ${contexto}
${chunkNote}
⚠️ REGRAS CRÍTICAS (dado financeiro — precisão absoluta):
1. Extraia TODOS os lançamentos, SEM PULAR NENHUM. Percorra o documento inteiro, todas as páginas. Não resuma, não agrupe, não omita linhas por parecerem repetidas.
2. Datas SEMPRE no formato DD/MM/AAAA. NUNCA use AAAA-MM-DD nem MM/DD/AAAA.
3. Valores SEMPRE como número com ponto decimal (ex: 141.00), NUNCA "R$ 141,00" nem "141,00".
4. Retorne APENAS JSON válido — sem markdown, sem comentários, sem texto fora do JSON.

Identifique o banco pelo cabeçalho/logo (campo "bank" — apenas informativo).

Para CADA lançamento retorne:
- "date": data do lançamento em DD/MM/AAAA.
- "description": descrição do lançamento (estabelecimento/contraparte). Se for compra PARCELADA no crédito (ex: sufixo "04/12"), anexe " (N/T)" ao final da descrição — ex: "LOJA X (04/12)".
- "merchant": mesmo estabelecimento/contraparte, sem o sufixo de parcela.
- "installmentNumber": quando a linha for compra PARCELADA (sufixo "N/T", ex: "04/12"), o número da parcela atual (N, ex: 4) como inteiro. Caso contrário, null.
- "installmentTotalDetected": quando a linha for compra PARCELADA, o total de parcelas (T, ex: 12) como inteiro. Caso contrário, null.
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
      "isCreditCardBillPayment": false,
      "installmentNumber": null,
      "installmentTotalDetected": null
    }
  ]
}
`
}

// Extrai um bloco (ou o documento inteiro, quando chunk === null) via Gemini.
// Reaproveitado tanto no fluxo single quanto no chunked.
async function extractChunk(
  apiKey: string,
  base64Pdf: string,
  statementType: StatementType,
  timeoutMs: number,
  chunk: ChunkInfo | null,
): Promise<BankStatementResult> {
  const model = GEMINI_OCR_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const label = chunk ? `chunk ${chunk.index}/${chunk.total} (pág ${chunk.startPage}-${chunk.endPage})` : 'documento inteiro'
  const pagesLabel = chunk ? `páginas ${chunk.startPage}-${chunk.endPage}` : 'o extrato'

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const startTime = Date.now()

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: base64Pdf } },
        { text: buildPrompt(statementType, chunk) },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
    },
  }

  // 503/429 são transitórios (modelo sobrecarregado) — retentar dentro do mesmo
  // orçamento de tempo (o 503 volta rápido, sobra tempo pra geração).
  let response: Response
  const MAX_ATTEMPTS = 3
  let attempt = 0
  try {
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
        if (e?.name === 'AbortError') {
          throw new Error(`Falha ao ler ${pagesLabel} do documento (tempo limite). Se o arquivo cobre muitos meses ou tem muitas páginas, exporte um período menor no seu banco (1 a 2 meses por vez) e importe cada período separadamente.`)
        }
        throw e
      }

      if ((response.status === 503 || response.status === 429) && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 3000 * attempt))
        continue
      }
      break
    }
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response!.ok) {
    const err = await response!.text()
    if (response!.status === 503 || response!.status === 429) {
      throw new Error(`O serviço de IA está sobrecarregado (falha em ${pagesLabel}). Tente novamente em instantes.`)
    }
    throw new Error(`Gemini API ${response!.status} ao ler ${pagesLabel}: ${err}`)
  }

  const responseData = await response!.json()
  const finishReason = responseData?.candidates?.[0]?.finishReason
  const text: string = responseData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  if (finishReason === 'MAX_TOKENS') {
    throw new Error(`O trecho (${pagesLabel}) tem lançamentos demais para processar de uma vez. Exporte um período menor no seu banco (1 a 2 meses por vez) e importe cada período separadamente.`)
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Não foi possível interpretar a resposta da IA para ${pagesLabel}.`)

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error(`Resposta da IA veio incompleta/inválida para ${pagesLabel}. Tente novamente.`)
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
        installmentNumber: toPositiveInt(t?.installmentNumber),
        installmentTotalDetected: toPositiveInt(t?.installmentTotalDetected),
      }
    })
    .filter(t => t.amount > 0)

  console.log(`[Gemini Extrato] ${label}: ${Date.now() - startTime}ms | ${transactions.length} lançamentos | declaredTotal=${parsed?.declaredTotal ?? 'null'}`)

  return {
    bank: parsed?.bank ? String(parsed.bank) : null,
    declaredTotal: parsed?.declaredTotal != null ? toNumber(parsed.declaredTotal) : null,
    transactions,
  }
}

// Divide o PDF em blocos de até CHUNK_SIZE_PAGES páginas, retornando o base64 de cada bloco.
async function splitPdfIntoChunks(base64Pdf: string): Promise<{ chunk: ChunkInfo; base64: string }[]> {
  const src = await PDFDocument.load(base64Pdf, { ignoreEncryption: true })
  const pageCount = src.getPageCount()
  const totalChunks = Math.ceil(pageCount / CHUNK_SIZE_PAGES)
  const out: { chunk: ChunkInfo; base64: string }[] = []

  for (let c = 0; c < totalChunks; c++) {
    const start = c * CHUNK_SIZE_PAGES
    const end = Math.min(start + CHUNK_SIZE_PAGES, pageCount)
    const doc = await PDFDocument.create()
    const indices = Array.from({ length: end - start }, (_, i) => start + i)
    const pages = await doc.copyPages(src, indices)
    pages.forEach(p => doc.addPage(p))
    const base64 = await doc.saveAsBase64()
    out.push({
      chunk: { index: c + 1, total: totalChunks, startPage: start + 1, endPage: end },
      base64,
    })
  }
  return out
}

export async function extractBankStatementWithGemini(
  base64Pdf: string,
  statementType: StatementType,
): Promise<BankStatementResult> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
  console.log('[Gemini Extrato] API key disponível:', !!apiKey, '| tipo:', statementType)
  if (!apiKey) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY não configurada.')

  // Quantas páginas tem o PDF? Se poucas, mantém 1 chamada só (sem overhead de split).
  let pageCount: number
  try {
    const doc = await PDFDocument.load(base64Pdf, { ignoreEncryption: true })
    pageCount = doc.getPageCount()
  } catch (e: any) {
    console.log('[Gemini Extrato] pdf-lib não conseguiu ler o PDF, indo de chamada única:', e?.message)
    return extractChunk(apiKey, base64Pdf, statementType, SINGLE_TIMEOUT_MS, null)
  }

  if (pageCount <= CHUNK_SIZE_PAGES) {
    console.log(`[Gemini Extrato] ${pageCount} páginas → 1 chamada`)
    return extractChunk(apiKey, base64Pdf, statementType, SINGLE_TIMEOUT_MS, null)
  }

  // Documento grande → dividir em blocos e processar em paralelo.
  const chunks = await splitPdfIntoChunks(base64Pdf)
  console.log(`[Gemini Extrato] ${pageCount} páginas → ${chunks.length} blocos de até ${CHUNK_SIZE_PAGES}, em paralelo`)
  const startTime = Date.now()

  // Promise.all: se um bloco falhar (mesmo após retries), a extração inteira
  // falha com o erro do bloco — NUNCA silenciamos lançamentos faltantes.
  const results = await Promise.all(
    chunks.map(({ chunk, base64 }) => extractChunk(apiKey, base64, statementType, CHUNK_TIMEOUT_MS, chunk)),
  )

  // Merge — transactions na ordem dos blocos
  const transactions = results.flatMap(r => r.transactions)
  const bank = results.map(r => r.bank).find(b => b != null) ?? null

  // declaredTotal: candidatos não-nulos; se divergirem, usa o do ÚLTIMO bloco
  // que retornou (saldo/total final tende a aparecer perto do fim do documento).
  const declaredCandidates = results
    .map((r, i) => ({ chunk: i + 1, value: r.declaredTotal }))
    .filter(c => c.value != null) as { chunk: number; value: number }[]

  let declaredTotal: number | null = null
  if (declaredCandidates.length > 0) {
    const distinct = [...new Set(declaredCandidates.map(c => c.value))]
    if (distinct.length > 1) {
      console.log('[Gemini Extrato] declaredTotal DIVERGENTE entre blocos:', JSON.stringify(declaredCandidates), '→ usando o do último bloco')
    }
    declaredTotal = declaredCandidates[declaredCandidates.length - 1].value
  }

  console.log(`[Gemini Extrato] merge em ${Date.now() - startTime}ms: ${transactions.length} lançamentos | bank=${bank} | declaredTotal=${declaredTotal}`)

  return { bank, declaredTotal, transactions }
}
