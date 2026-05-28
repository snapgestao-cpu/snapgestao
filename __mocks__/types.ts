export type IRCategory =
  | 'saude' | 'educacao' | 'previdencia_pgbl'
  | 'previdencia_social' | 'doacao' | 'pensao' | 'outros'

export type Transaction = {
  id: string
  user_id: string
  type: 'income' | 'expense'
  amount: number
  description: string | null
  date: string
  payment_method: string
  pot_id: string | null
  is_ir_deductible?: boolean
  ir_category?: IRCategory | null
  ir_provider_name?: string | null
  ir_provider_document?: string | null
  billing_date?: string | null
  credit_card_id?: string | null
  installments?: number | null
  installment_number?: number | null
  need_want?: 'need' | 'want' | null
  created_at?: string
}

export type CreditCard = {
  id: string
  user_id: string
  name: string
  closing_day: number
  due_day: number
  limit: number
  brand?: string
  created_at?: string
}
