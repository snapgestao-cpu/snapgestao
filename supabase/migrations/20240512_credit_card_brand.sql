ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT 'generic';
