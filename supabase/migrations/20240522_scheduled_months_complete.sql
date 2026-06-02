-- Migration definitiva: garante todas as colunas de override em scheduled_transaction_months.
--
-- Estado original da tabela (20240501_scheduled_transactions.sql):
--   id, scheduled_transaction_id, user_id, reference_month,
--   status, transaction_id, confirmed_at
--
-- Colunas adicionadas aqui (cobertas também pela 20240520, mas idempotente):
--   payment_method, credit_card_id, description, amount, merchant, date
--
-- Campos IR NÃO estão nesta tabela por design — são salvos em scheduled_transactions
-- e copiados para transactions apenas no momento da confirmação.

ALTER TABLE public.scheduled_transaction_months
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT NULL
    CHECK (payment_method IS NULL OR payment_method IN (
      'cash', 'debit', 'credit', 'pix', 'transfer',
      'voucher_alimentacao', 'voucher_refeicao'
    )),
  ADD COLUMN IF NOT EXISTS credit_card_id UUID
    REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS merchant TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS date DATE DEFAULT NULL;

GRANT ALL ON public.scheduled_transaction_months TO anon, authenticated;
