export type User = {
  id: string
  name: string
  currency: string
  cycle_start: number
  initial_balance: number
  created_at: string
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
