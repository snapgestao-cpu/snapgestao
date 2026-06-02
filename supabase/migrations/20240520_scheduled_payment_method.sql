-- Adicionar forma de pagamento e cartão na tabela de agendados
ALTER TABLE public.scheduled_transactions
  ADD COLUMN IF NOT EXISTS credit_card_id UUID
    REFERENCES public.credit_cards(id) ON DELETE SET NULL;

-- Colunas de override por mês (todas nullable — null = herda do pai)
ALTER TABLE public.scheduled_transaction_months
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT NULL
    CHECK (payment_method IS NULL OR payment_method IN (
      'cash', 'debit', 'credit', 'pix', 'transfer',
      'voucher_alimentacao', 'voucher_refeicao'
    ));

ALTER TABLE public.scheduled_transaction_months
  ADD COLUMN IF NOT EXISTS credit_card_id UUID
    REFERENCES public.credit_cards(id) ON DELETE SET NULL;

ALTER TABLE public.scheduled_transaction_months
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

ALTER TABLE public.scheduled_transaction_months
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) DEFAULT NULL;

ALTER TABLE public.scheduled_transaction_months
  ADD COLUMN IF NOT EXISTS merchant TEXT DEFAULT NULL;

ALTER TABLE public.scheduled_transaction_months
  ADD COLUMN IF NOT EXISTS date DATE DEFAULT NULL;

GRANT ALL ON public.scheduled_transactions TO anon, authenticated;
GRANT ALL ON public.scheduled_transaction_months TO anon, authenticated;
