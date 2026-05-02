CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_price_data BOOLEAN DEFAULT NULL,
  share_price_accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own user_preferences" ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id);
