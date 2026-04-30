-- Add AI token balance to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ai_tokens INT NOT NULL DEFAULT 5;

-- Atomic consume: decrements only if balance > 0, returns remaining or -1
CREATE OR REPLACE FUNCTION use_ai_token(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining INT;
BEGIN
  UPDATE public.users
  SET ai_tokens = ai_tokens - 1
  WHERE id = p_user_id AND ai_tokens > 0
  RETURNING ai_tokens INTO remaining;

  IF remaining IS NULL THEN
    RETURN -1; -- sem tokens
  END IF;

  RETURN remaining;
END;
$$;
