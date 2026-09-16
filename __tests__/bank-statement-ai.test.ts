import { partitionBillPayments } from '../lib/bank-statement-ai'
import type { BankStatementTxn } from '../lib/bank-statement-ai'

// Helper para montar uma transação de extrato com defaults enxutos.
function txn(over: Partial<BankStatementTxn>): BankStatementTxn {
  return {
    date: '01/01/2026',
    description: 'Item',
    merchant: 'Item',
    amount: 10,
    type: 'expense',
    paymentMethod: 'debit',
    installmentTotal: 1,
    isCreditCardBillPayment: false,
    ...over,
  }
}

describe('partitionBillPayments — filtro de pagamento de fatura', () => {
  const txns: BankStatementTxn[] = [
    txn({ description: 'Padaria', amount: 20 }),
    txn({ description: 'GASTOS CARTAO DE CREDITO', amount: 1500, isCreditCardBillPayment: true }),
    txn({ description: 'PIX recebido', amount: 300, type: 'income', paymentMethod: 'pix' }),
    txn({ description: 'PAGAMENTO FATURA CARTAO', amount: 800, isCreditCardBillPayment: true }),
  ]

  it('separa exatamente os itens marcados isCreditCardBillPayment', () => {
    const { billPayments, withoutBillPayments } = partitionBillPayments(txns)
    expect(billPayments).toHaveLength(2)
    expect(billPayments.every(t => t.isCreditCardBillPayment)).toBe(true)
  })

  it('"Excluir": nenhum item com isCreditCardBillPayment sobra, e a contagem bate', () => {
    const { billPayments, withoutBillPayments } = partitionBillPayments(txns)
    expect(withoutBillPayments).toHaveLength(txns.length - billPayments.length)
    expect(withoutBillPayments.some(t => t.isCreditCardBillPayment)).toBe(false)
    // Confirma que nenhum item legítimo foi removido junto.
    expect(withoutBillPayments.map(t => t.description)).toEqual(['Padaria', 'PIX recebido'])
  })

  it('"Incluir mesmo assim": mantém todos os itens e remapeia os pagamentos para transfer', () => {
    const { includedAsTransfer } = partitionBillPayments(txns)
    expect(includedAsTransfer).toHaveLength(txns.length)
    const remapped = includedAsTransfer.filter(t =>
      t.description === 'GASTOS CARTAO DE CREDITO' || t.description === 'PAGAMENTO FATURA CARTAO'
    )
    expect(remapped.every(t => t.paymentMethod === 'transfer')).toBe(true)
    // Itens não-fatura preservam sua forma de pagamento original.
    expect(includedAsTransfer.find(t => t.description === 'Padaria')?.paymentMethod).toBe('debit')
  })

  it('sem pagamentos de fatura: partição vazia e lista intacta', () => {
    const semFatura = [txn({ description: 'Mercado' }), txn({ description: 'Farmácia' })]
    const { billPayments, withoutBillPayments } = partitionBillPayments(semFatura)
    expect(billPayments).toHaveLength(0)
    expect(withoutBillPayments).toHaveLength(2)
  })
})
