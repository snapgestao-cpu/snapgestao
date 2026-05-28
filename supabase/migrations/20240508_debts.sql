-- Migration: Controle de Dívidas
-- Tabelas: debts, debt_transactions

CREATE TABLE IF NOT EXISTS public.debts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_payment NUMERIC(12,2),
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debts: owner full access" ON public.debts
  FOR ALL USING (auth.uid() = user_id);

GRANT ALL ON public.debts TO anon, authenticated;

-- Histórico de pagamentos de dívidas
CREATE TABLE IF NOT EXISTS public.debt_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('payment_external', 'payment_from_cycle')),
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  cycle_year INTEGER,
  cycle_month INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.debt_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debt_transactions: owner full access" ON public.debt_transactions
  FOR ALL USING (auth.uid() = user_id);

GRANT ALL ON public.debt_transactions TO anon, authenticated;

-- Índice para lookup por dívida
CREATE INDEX IF NOT EXISTS idx_debt_transactions_debt_id ON public.debt_transactions(debt_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_status ON public.debts(user_id, status);
