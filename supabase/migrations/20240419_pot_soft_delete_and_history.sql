-- Soft delete on pots
ALTER TABLE public.pots
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Pot limit history: track limit changes per cycle
CREATE TABLE IF NOT EXISTS public.pot_limit_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id        UUID NOT NULL REFERENCES public.pots(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  limit_amount  NUMERIC(12,2) NOT NULL,
  valid_from    DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pot_limit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pot_history_own" ON public.pot_limit_history
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
