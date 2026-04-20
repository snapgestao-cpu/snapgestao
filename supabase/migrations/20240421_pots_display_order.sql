-- Coluna de ordenação para arrastar potes na tela de Potes
ALTER TABLE public.pots
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

UPDATE public.pots
  SET display_order = 0
  WHERE display_order IS NULL;
