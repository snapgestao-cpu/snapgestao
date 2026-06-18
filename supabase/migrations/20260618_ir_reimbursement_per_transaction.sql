ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS ir_reimbursement_amount NUMERIC(12,2);
