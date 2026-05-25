export type IRCategory = 'saude' | 'educacao' | 'previdencia_pgbl' | 'previdencia_social' | 'doacao' | 'pensao' | 'outros'

export type User = {
  id: string
  name: string
  currency: string
  cycle_start: number
  initial_balance: number
  onboarding_completed: boolean
  ai_tokens: number
  created_at: string
  terms_accepted_at: string | null
  terms_version: string | null
  ir_module_enabled: boolean
  plan: 'free' | 'premium'
}

export type Pot = {
  id: string
  user_id: string
  parent_pot_id: string | null
  name: string
  icon: string | null
  color: string
  limit_amount: number | null
  limit_type: 'absolute' | 'percent_income'
  is_emergency: boolean
  mesada_limit: number | null
  mesada_active: boolean
  created_at: string
  deleted_at: string | null
}

export type Transaction = {
  id: string
  user_id: string
  pot_id: string | null
  card_id: string | null
  type: 'expense' | 'income' | 'transfer' | 'goal_deposit'
  amount: number
  description: string | null
  merchant: string | null
  date: string
  billing_date: string | null
  payment_method: 'cash' | 'debit' | 'credit' | 'pix' | 'transfer'
  is_need: boolean | null
  installment_total: number | null
  installment_number: number | null
  installment_group_id: string | null
  created_at: string
  is_ir_deductible: boolean | null
  ir_category: IRCategory | null
  ir_provider_name: string | null
  ir_provider_document: string | null
  ir_receipt_number: string | null
  ir_receipt_image_path: string | null
}

export type Goal = {
  id: string
  user_id: string
  name: string
  target_amount: number
  current_amount: number
  horizon_years: number
  target_date: string | null
  interest_rate: number | null
  monthly_deposit: number | null
  status: 'active' | 'completed' | 'cancelled'
  completed_at: string | null
  completion_type: string | null
}

export type PotLimitHistory = {
  id: string
  pot_id: string
  user_id: string
  limit_amount: number
  valid_from: string
  created_at: string
}

export type CreditCard = {
  id: string
  user_id: string
  name: string
  last_four: string | null
  closing_day: number
  due_day: number
  credit_limit: number | null
  brand: string | null
}

export type IncomeSource = {
  id: string
  user_id: string
  name: string
  type: 'salary' | 'freelance' | 'rent' | 'dividend' | 'other'
  amount: number
  recurrence_day: number
  is_primary: boolean
}
