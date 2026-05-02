-- Tabela principal: lançamentos orçados/agendados
CREATE TABLE IF NOT EXISTS public.scheduled_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pot_id UUID NOT NULL REFERENCES public.pots(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  merchant TEXT,
  start_date DATE NOT NULL,
  total_months INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de meses: um registro por mês de cada lançamento agendado
CREATE TABLE IF NOT EXISTS public.scheduled_transaction_months (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_transaction_id UUID NOT NULL REFERENCES public.scheduled_transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  UNIQUE(scheduled_transaction_id, reference_month)
);

-- RLS
ALTER TABLE public.scheduled_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_transaction_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own scheduled_transactions" ON public.scheduled_transactions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users own scheduled_transaction_months" ON public.scheduled_transaction_months
  FOR ALL USING (auth.uid() = user_id);
