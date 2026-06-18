-- Adiciona surplus_amount para permitir reverter sobra ao reabrir ciclo
ALTER TABLE public.cycle_rollovers
  ADD COLUMN IF NOT EXISTS surplus_amount NUMERIC(12,2) DEFAULT 0;
