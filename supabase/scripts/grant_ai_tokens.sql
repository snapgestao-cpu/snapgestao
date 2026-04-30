-- ─────────────────────────────────────────────────────────────────────────────
-- Script para conceder tokens de IA a usuários
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ver saldo atual de todos os usuários
SELECT u.id, au.email, u.name, u.ai_tokens
FROM public.users u
JOIN auth.users au ON au.id = u.id
ORDER BY u.ai_tokens ASC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Conceder tokens para um usuário específico (por e-mail)
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE public.users
-- SET ai_tokens = ai_tokens + 5          -- adiciona 5 tokens
-- WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'usuario@email.com'
-- );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Definir saldo fixo para um usuário específico
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE public.users
-- SET ai_tokens = 10                     -- define exatamente 10 tokens
-- WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'usuario@email.com'
-- );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Conceder tokens para TODOS os usuários
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE public.users
-- SET ai_tokens = ai_tokens + 5;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Resetar todos para 5 tokens (padrão inicial)
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE public.users SET ai_tokens = 5;
