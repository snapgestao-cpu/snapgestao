-- Adicionar coluna onboarding_completed na tabela users
-- Executar no Supabase SQL Editor

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Marcar usuários existentes (com pote cadastrado) como completos
UPDATE public.users u
SET onboarding_completed = true
WHERE EXISTS (
  SELECT 1 FROM public.pots p
  WHERE p.user_id = u.id
);
