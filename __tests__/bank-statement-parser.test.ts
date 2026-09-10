/**
 * Testes do parser de extratos Bradesco.
 *
 * Usa dados SINTÉTICOS inline (nomes/valores fictícios) que reproduzem o
 * formato do TEXTO extraído dos PDFs — nunca dados reais de cliente. Cada
 * amostra foi montada para exercitar todas as regras do parser.
 */
import { parseBradescoDebito, parseBradescoCredito } from '../supabase/functions/parse-bank-statement/parser'

// Extrato de conta corrente (débito). Inclui: saldo de abertura (COD. LANC.),
// PIX recebido/enviado com REM:/DES: + data solta, compra no cartão, pagamento
// eletrônico com estabelecimento que começa com "BRADESCO" (não pode sumir),
// linhas excluídas (RENTAB / GASTOS CARTAO DE CREDITO), quebra de página com
// cabeçalho repetido e linha "Total" de rodapé.
const DEBITO = `Bradesco Celular
Data: 01/02/2030 - 10h00
Nome: FULANO DE TAL
Extrato de: Agência: 000 | Conta: 00000-0 | Movimentação entre: 01/01/2030 e 31/01/2030 Folha: 1/2
Data Histórico Docto. Crédito (R$) Débito (R$) Saldo (R$)
01/01/2030 COD. LANC. 0 0,00 1.000,00
PIX RECEBIDO
REM: CONTRAPARTE UM 01/01 1234567 500,00 1.500,00
COMPRA CARTAO VISA
LOJA EXEMPLO 7654321 100,00 1.400,00
PAGTO ELETRON COBRANCA
BRADESCO VIDA E PREVIDENCIA 0000001 50,00 1.350,00
RENTAB.INVEST FACILCRED* 0000002 0,10 1.350,10
Bradesco Celular
Data: 01/02/2030 - 10h00
Nome: FULANO DE TAL
Extrato de: Agência: 000 | Conta: 00000-0 | Últimos Lancamentos Folha: 2/2
Data Histórico Docto. Crédito (R$) Débito (R$) Saldo (R$)
PIX ENVIADO
DES: OUTRO CONTRAPARTE 02/01 7777777 200,00 1.150,10
GASTOS CARTAO DE CREDITO 3990000 150,10 1.000,00
Total 500,00 500,10 1.000,00`

// Fatura de crédito. Inclui: cabeçalho com Vencimento + Total da fatura,
// pagamento da fatura anterior (excluído), compra normal, compra com parcela
// NN/NN colada, estorno (sufixo " -"), lançamento com data de mês > vencimento
// (ano anterior) e quebrado em 3 linhas, além das linhas "Total ..." de rodapé.
const CREDITO = `Fatura Mensal
Vencimento
01/07/2030
Total da fatura
R$ 240,00
Lançamentos
Data Histórico de Lançamentos Cidade US$ Cotação
do Dólar R$
01/06 PAGTO. POR DEB EM C/C 1.000,00 -
FULANO DE TAL Cartão 0000 XXXXXX 00000
10/05 LOJA UM CIDADE X 100,00
12/05 LOJA DOIS*Plano04/12 CIDADE Y 50,00
15/05 LOJA TRES CIDADE Z 30,00 -
20/08 LOJA QUATRO CIDADE W
CONT
120,00
Total para FULANO DE TAL 300,00
Total da fatura em real 240,00`

describe('parseBradescoDebito', () => {
  const rows = parseBradescoDebito(DEBITO)

  it('extrai apenas os lançamentos reais (exclui COD.LANC/RENTAB/GASTOS/Total)', () => {
    expect(rows.length).toBe(4)
    for (const r of rows) {
      expect(r.description.toUpperCase()).not.toContain('RENTAB')
      expect(r.description.toUpperCase()).not.toContain('GASTOS CARTAO')
      expect(r.description.toUpperCase()).not.toContain('COD. LANC')
      expect(r.description.toUpperCase()).not.toBe('TOTAL')
    }
  })

  it('classifica income/expense pela variação do saldo', () => {
    // saldo subiu (1.000 -> 1.500) = crédito
    expect(rows[0]).toMatchObject({
      date: '01/01/2030',
      description: 'CONTRAPARTE UM',
      amount: 500,
      type: 'income',
      paymentMethod: 'pix',
    })
    expect(rows.filter(r => r.type === 'income').length).toBe(1)
    expect(rows.filter(r => r.type === 'expense').length).toBe(3)
  })

  it('remove prefixo REM:/DES: e a data solta DD/MM do nome do contraparte', () => {
    expect(rows.find(r => r.amount === 200)?.description).toBe('OUTRO CONTRAPARTE')
    for (const r of rows) {
      expect(r.description).not.toMatch(/^(REM|DES):/i)
      expect(r.description).not.toMatch(/\d{2}\/\d{2}$/)
    }
  })

  it('mapeia categorias para o paymentMethod correto', () => {
    expect(rows.find(r => r.description === 'LOJA EXEMPLO')?.paymentMethod).toBe('debit')
    expect(rows.find(r => r.description === 'BRADESCO VIDA E PREVIDENCIA')?.paymentMethod).toBe('transfer')
    const allowed = new Set(['pix', 'debit', 'credit', 'transfer'])
    expect(rows.every(r => allowed.has(r.paymentMethod))).toBe(true)
  })

  it('não descarta estabelecimentos que começam com "Bradesco"', () => {
    // cuidado: "Bradesco Celular" é cabeçalho, mas "BRADESCO VIDA..." é real
    expect(rows.some(r => r.description === 'BRADESCO VIDA E PREVIDENCIA')).toBe(true)
  })

  it('sempre retorna installmentTotal 1, valor positivo e data válida', () => {
    expect(rows.every(r => r.installmentTotal === 1)).toBe(true)
    expect(rows.every(r => r.amount > 0)).toBe(true)
    expect(rows.every(r => /^\d{2}\/\d{2}\/\d{4}$/.test(r.date))).toBe(true)
  })
})

describe('parseBradescoCredito', () => {
  const rows = parseBradescoCredito(CREDITO)

  it('extrai apenas as compras (exclui PAGTO. POR DEB EM C/C e linhas Total)', () => {
    expect(rows.length).toBe(4)
    for (const r of rows) {
      expect(r.description.toUpperCase()).not.toContain('PAGTO')
      expect(r.description.toUpperCase()).not.toContain('TOTAL PARA')
      expect(r.description.toUpperCase()).not.toContain('TOTAL DA FATURA')
    }
  })

  it('a soma líquida (compras - estornos) bate com o Total da fatura', () => {
    const net = rows.reduce((s, t) => s + (t.type === 'income' ? -t.amount : t.amount), 0)
    expect(net).toBeCloseTo(240, 2) // 100 + 50 + 120 - 30
  })

  it('todos os lançamentos são credit e installmentTotal 1', () => {
    expect(rows.every(r => r.paymentMethod === 'credit')).toBe(true)
    expect(rows.every(r => r.installmentTotal === 1)).toBe(true)
  })

  it('trata sufixo " -" como estorno (income)', () => {
    const estorno = rows.find(r => r.type === 'income')
    expect(estorno).toBeTruthy()
    expect(estorno!.amount).toBeCloseTo(30, 2)
  })

  it('detecta parcela NN/NN, remove do merchant e anexa (N/T) na description', () => {
    const parcelado = rows.find(r => r.merchant.includes('LOJA DOIS'))
    expect(parcelado).toBeTruthy()
    expect(parcelado!.merchant).not.toMatch(/\d{2}\/\d{2}/)
    expect(parcelado!.description).toMatch(/\(04\/12\)$/)
  })

  it('infere o ano pelo vencimento: mês > vencimento (07) => ano anterior', () => {
    // 10/05, 12/05, 15/05 (<= 07) => 2030; 20/08 (> 07) => 2029
    expect(rows.find(r => r.amount === 100)?.date).toBe('10/05/2030')
    expect(rows.find(r => r.amount === 120)?.date).toBe('20/08/2029')
  })

  it('remonta lançamentos quebrados em várias linhas físicas', () => {
    // "20/08 LOJA QUATRO CIDADE W" + "CONT" + "120,00" => um único lançamento
    const wrapped = rows.find(r => r.amount === 120)
    expect(wrapped).toBeTruthy()
    expect(wrapped!.merchant).toContain('LOJA QUATRO')
  })
})
