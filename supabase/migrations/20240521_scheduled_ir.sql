-- Adiciona ir_receipt_number em scheduled_transactions
-- (is_ir_deductible, ir_category, ir_provider_name, ir_provider_document
--  já existem desde 20240507_scheduled_transactions_ir.sql)

ALTER TABLE public.scheduled_transactions
  ADD COLUMN IF NOT EXISTS is_ir_deductible     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ir_category          TEXT
    CHECK (ir_category IS NULL OR ir_category IN (
      'saude', 'educacao', 'previdencia_pgbl',
      'previdencia_social', 'doacao', 'pensao', 'outros'
    )),
  ADD COLUMN IF NOT EXISTS ir_provider_name     TEXT,
  ADD COLUMN IF NOT EXISTS ir_provider_document TEXT,
  ADD COLUMN IF NOT EXISTS ir_receipt_number    TEXT;

GRANT ALL ON public.scheduled_transactions TO anon, authenticated;
