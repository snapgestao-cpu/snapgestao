import { groupByCategory, IR_LIMITS, IR_CATEGORY_LABELS } from '../lib/ir'
import type { IRDeductible } from '../lib/ir'
import type { Transaction } from '../types'

const tx = (id: string, amount: number, category: string): IRDeductible => ({
  id,
  user_id: 'u1',
  type: 'expense',
  amount,
  description: 'teste',
  date: '2025-01-01',
  payment_method: 'transfer',
  pot_id: null,
  card_id: null,
  merchant: null,
  billing_date: null,
  is_need: null,
  installment_total: null,
  installment_number: null,
  installment_group_id: null,
  created_at: '2025-01-01T00:00:00Z',
  is_ir_deductible: true,
  ir_category: category as any,
  ir_provider_name: null,
  ir_provider_document: null,
  ir_receipt_number: null,
  ir_receipt_image_path: null,
} as IRDeductible)

describe('groupByCategory', () => {
  it('retorna array vazio para lista vazia', () => {
    expect(groupByCategory([])).toEqual([])
  })

  it('agrupa itens por categoria', () => {
    const items = [
      tx('1', 500, 'saude'),
      tx('2', 300, 'saude'),
      tx('3', 200, 'educacao'),
    ]
    const result = groupByCategory(items)
    expect(result).toHaveLength(2)
    const saude = result.find(g => g.category === 'saude')!
    expect(saude.total).toBe(800)
    expect(saude.items).toHaveLength(2)
    const edu = result.find(g => g.category === 'educacao')!
    expect(edu.total).toBe(200)
  })

  it('inclui label correto', () => {
    const result = groupByCategory([tx('1', 100, 'educacao')])
    expect(result[0].label).toBe('Educação')
  })

  it('inclui limit correto da categoria', () => {
    const result = groupByCategory([tx('1', 100, 'educacao')])
    expect(result[0].limit).toBe(3561.50)
  })

  it('saúde não tem limite (null)', () => {
    const result = groupByCategory([tx('1', 10000, 'saude')])
    expect(result[0].limit).toBeNull()
  })

  it('preserva ordem de inserção', () => {
    const items = [
      tx('1', 100, 'doacao'),
      tx('2', 200, 'saude'),
      tx('3', 150, 'doacao'),
    ]
    const result = groupByCategory(items)
    expect(result[0].category).toBe('doacao')
    expect(result[1].category).toBe('saude')
  })
})

describe('IR_LIMITS', () => {
  it('educacao tem limite de R$ 3.561,50', () => {
    expect(IR_LIMITS.educacao).toBe(3561.50)
  })

  it('saude, previdencia_pgbl, previdencia_social, doacao, pensao, outros têm null', () => {
    const semLimite: (keyof typeof IR_LIMITS)[] = [
      'saude', 'previdencia_pgbl', 'previdencia_social', 'doacao', 'pensao', 'outros'
    ]
    for (const cat of semLimite) {
      expect(IR_LIMITS[cat]).toBeNull()
    }
  })
})

describe('IR_CATEGORY_LABELS', () => {
  it('todas as categorias têm label', () => {
    for (const cat of Object.keys(IR_LIMITS)) {
      expect(IR_CATEGORY_LABELS[cat as keyof typeof IR_CATEGORY_LABELS]).toBeTruthy()
    }
  })
})
