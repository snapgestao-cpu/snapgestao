/**
 * Parser de extratos Bradesco (débito/conta e fatura de crédito).
 *
 * Módulo PURO: recebe o TEXTO já extraído do PDF (uma string com todas as
 * páginas) e devolve os lançamentos. Não importa nada de Deno nem de libs de
 * PDF — assim pode ser testado no Jest (ver __tests__/bank-statement-parser.test.ts)
 * e reutilizado pela Edge Function `index.ts`, que só cuida de PDF→texto.
 *
 * Observações importantes derivadas do TEXTO REAL extraído (unpdf), que difere
 * do layout visual:
 *  - Débito: a extração funde as colunas Crédito/Débito num único valor + saldo.
 *    Por isso o tipo (income/expense) é inferido pela VARIAÇÃO DO SALDO corrente
 *    (subiu = crédito/income, desceu = débito/expense), semeado pelo saldo de
 *    abertura "COD. LANC.". A categoria fica numa linha própria e a linha de
 *    detalhe traz "<nome> [DD/MM] <docto> <valor> <saldo>".
 *  - Crédito: linhas de lançamento às vezes QUEBRAM em 2-3 linhas físicas
 *    (cidade/valor em linhas separadas), então são remontadas até fechar num
 *    valor monetário no fim.
 */

export type ParsedTxn = {
  date: string // DD/MM/AAAA
  description: string
  merchant: string
  amount: number
  type: 'expense' | 'income'
  paymentMethod: 'pix' | 'debit' | 'credit' | 'transfer'
  installmentTotal: 1
}

export type StatementType = 'debito' | 'credito'

// ── Helpers de valor ────────────────────────────────────────────────────────

const MONEY = /\d{1,3}(?:\.\d{3})*,\d{2}/g
const MONEY_TOKEN = /^\d{1,3}(?:\.\d{3})*,\d{2}$/

function parseMoney(s: string): number {
  return Math.abs(parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0)
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-zà-ú])/g, (m) => m.toUpperCase()).trim()
}

function tidyName(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[\s\-*.]+$/g, '') // pontuação/glue solta no fim
    .trim()
}

// ── DÉBITO (conta corrente) ──────────────────────────────────────────────────

function isDebitNoise(line: string): boolean {
  const l = line.trim()
  if (!l) return true
  if (/^=====\s*PAGE/i.test(l)) return true
  // Só o cabeçalho de página "Bradesco Celular" — NÃO confundir com
  // estabelecimentos reais tipo "BRADESCO VIDA E PREVIDENCIA" / "BRADESCO C-SEFAZ..."
  if (/^Bradesco Celular/i.test(l)) return true
  if (/^Data:/i.test(l)) return true
  if (/^Nome:/i.test(l)) return true
  if (/^Extrato de:/i.test(l)) return true
  if (/Folha:\s*\d+\/\d+/i.test(l)) return true
  if (/Hist[oó]rico/i.test(l) && /Docto/i.test(l)) return true
  if (/^Total\b/i.test(l)) return true
  return false
}

function debitPaymentMethod(category: string): ParsedTxn['paymentMethod'] {
  const c = category.toUpperCase()
  if (c.includes('PIX')) return 'pix'
  if (c.includes('COMPRA CARTAO')) return 'debit'
  // PAGTO ELETRON COBRANCA, CONTA DE TELEFONE, PAGTO ELETRONICO TRIBUTO,
  // TED ..., DEP DINHEIRO INTER AG → transferência
  return 'transfer'
}

function debitExcluded(category: string): boolean {
  const c = category.toUpperCase()
  return (
    c.includes('RENTAB') ||               // rendimento de centavos
    c.includes('GASTOS CARTAO DE CREDITO') || // pagamento agregado da fatura
    c.includes('COD. LANC') || c.includes('COD LANC') // marcador de abertura
  )
}

export function parseBradescoDebito(text: string): ParsedTxn[] {
  const lines = text.split('\n')
  const out: ParsedTxn[] = []

  let currentDate = ''       // DD/MM/AAAA "carregada" da coluna Data
  let pendingCategory: string | null = null
  let prevSaldo: number | null = null

  for (const raw of lines) {
    if (isDebitNoise(raw)) continue
    let line = raw.trim()

    // Data só aparece na 1ª linha do dia — carrega e segue
    const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+/)
    if (dateMatch) {
      currentDate = dateMatch[1]
      line = line.slice(dateMatch[0].length).trim()
    }
    if (!line) continue

    const monies = [...line.matchAll(MONEY)]

    // Sem valor monetário → é a linha de categoria (destaque) do próximo detalhe
    if (monies.length === 0) {
      pendingCategory = line
      continue
    }

    // Linha com valor: saldo é o último; valor (se houver) o penúltimo
    const saldoMatch = monies[monies.length - 1]
    const saldo = parseMoney(saldoMatch[0])
    const hasValue = monies.length >= 2
    const valueMatch = hasValue ? monies[monies.length - 2] : null
    const value = valueMatch ? parseMoney(valueMatch[0]) : 0

    // Texto antes do valor = "<nome/categoria> <docto>"
    const prefixEnd = (valueMatch ?? saldoMatch).index ?? line.length
    let prefix = line.slice(0, prefixEnd).trim()
    prefix = prefix.replace(/\s+\d+$/, '').trim() // remove docto (inteiro)

    const isDetail = pendingCategory !== null
    const category = isDetail ? (pendingCategory as string) : prefix
    pendingCategory = null

    // tipo pela variação do saldo (reproduz coluna crédito vs débito)
    let type: 'expense' | 'income'
    if (prevSaldo !== null) {
      type = saldo >= prevSaldo ? 'income' : 'expense'
    } else {
      // fallback quando não há saldo semeado ainda
      type = /RECEB|DEVOLUCAO|DEP DINHEIRO|C SAL/i.test(category) ? 'income' : 'expense'
    }
    prevSaldo = saldo

    if (debitExcluded(category)) continue
    if (value <= 0) continue

    // Nome/descrição
    let name: string
    if (isDetail) {
      let detail = prefix
      const rd = detail.match(/^(REM|DES):\s*(.*)$/i)
      if (rd) {
        // remove sufixo de data solta "DD/MM" no fim do nome do contraparte
        name = tidyName(rd[2].replace(/\s+\d{2}\/\d{2}\s*$/, ''))
      } else {
        name = tidyName(detail)
      }
      if (!name) name = titleCase(category)
    } else {
      name = titleCase(category)
    }

    out.push({
      date: currentDate,
      description: name,
      merchant: name,
      amount: value,
      type,
      paymentMethod: debitPaymentMethod(category),
      installmentTotal: 1,
    })
  }

  return out
}

// ── CRÉDITO (fatura) ─────────────────────────────────────────────────────────

const TRAILING_VALUE = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(-)?\s*$/
const LAUNCH_START = /^\d{2}\/\d{2}\s/

function extractVencimento(text: string): { month: number; year: number } {
  const m = text.match(/Vencimento[^\d]*(\d{2})\/(\d{2})\/(\d{4})/i)
  if (m) return { month: parseInt(m[2], 10), year: parseInt(m[3], 10) }
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

function creditYearFor(month: number, venc: { month: number; year: number }): number {
  // mesmo ano do vencimento, salvo se o mês do lançamento for MAIOR que o do
  // vencimento — aí é do ano anterior (mesma virada de ano de calcBillingDate)
  return month > venc.month ? venc.year - 1 : venc.year
}

function processCreditLaunch(buffer: string, venc: { month: number; year: number }): ParsedTxn | null {
  const dm = buffer.match(/^(\d{2})\/(\d{2})\s+(.*)$/)
  if (!dm) return null
  const day = dm[1]
  const month = parseInt(dm[2], 10)
  let rest = dm[3]

  // Excluir pagamento da fatura anterior (débito em conta) — não é compra
  if (/PAGTO\.?\s*POR\s*DEB\s*EM\s*C\/C/i.test(rest)) return null
  if (/^Total\b/i.test(rest)) return null

  const vm = rest.match(TRAILING_VALUE)
  if (!vm) return null
  const amount = parseMoney(vm[1])
  const isCredit = !!vm[2] // sufixo " -" = estorno/crédito na fatura
  if (amount <= 0) return null

  let middle = rest.slice(0, vm.index).trim()

  // Parcela colada/solta: "NN/NN" no meio (entre estabelecimento e cidade).
  // Sem look-behind: o total costuma vir grudado a um dígito do nome
  // (ex: "DWXZWV004/04"). Guarda de sanidade: parcela atual <= total.
  let parcela: string | null = null
  for (const m of middle.matchAll(/(\d{2})\/(\d{2})(?!\d)/g)) {
    const cur = parseInt(m[1], 10)
    const tot = parseInt(m[2], 10)
    if (cur >= 1 && cur <= tot) {
      parcela = `${m[1]}/${m[2]}`
      middle = (middle.slice(0, m.index) + ' ' + middle.slice((m.index ?? 0) + m[0].length)).trim()
      break
    }
  }

  const merchant = tidyName(middle)
  if (!merchant) return null

  const year = creditYearFor(month, venc)
  const description = parcela ? `${merchant} (${parcela})` : merchant

  return {
    date: `${day}/${String(month).padStart(2, '0')}/${year}`,
    description,
    merchant,
    amount,
    type: isCredit ? 'income' : 'expense',
    paymentMethod: 'credit',
    installmentTotal: 1,
  }
}

export function parseBradescoCredito(text: string): ParsedTxn[] {
  const venc = extractVencimento(text)
  const lines = text.split('\n')
  const out: ParsedTxn[] = []

  let buffer: string | null = null
  let cont = 0 // linhas de continuação acumuladas (guarda contra swallow de lixo)

  const flush = () => {
    if (buffer !== null) {
      const txn = processCreditLaunch(buffer, venc)
      if (txn) out.push(txn)
    }
    buffer = null
    cont = 0
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (LAUNCH_START.test(line)) {
      flush() // fecha lançamento anterior (se incompleto, descarta)
      buffer = line
    } else if (buffer !== null) {
      buffer += ' ' + line
      cont++
    } else {
      continue
    }

    // Fechou num valor monetário? processa.
    if (buffer !== null && TRAILING_VALUE.test(buffer)) {
      flush()
    } else if (cont >= 3) {
      // remontagem não fechou em 3 linhas → provavelmente lixo, descarta
      buffer = null
      cont = 0
    }
  }
  flush()

  return out
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export function parseBradesco(statementType: StatementType, text: string): ParsedTxn[] {
  return statementType === 'credito'
    ? parseBradescoCredito(text)
    : parseBradescoDebito(text)
}
