-- Migration: IR deduction fields on scheduled_transactions
-- Allows recurring expenses (health insurance, school, PGBL, INSS) to carry IR metadata.
-- When confirmed, these fields are copied to the generated transaction.

ALTER TABLE scheduled_transactions
  ADD COLUMN IF NOT EXISTS is_ir_deductible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ir_category TEXT,
  ADD COLUMN IF NOT EXISTS ir_provider_name TEXT,
  ADD COLUMN IF NOT EXISTS ir_provider_document TEXT;
