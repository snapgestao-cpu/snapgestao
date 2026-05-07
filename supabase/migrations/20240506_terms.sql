-- Migration: aceite de Termos de Uso e Política de Privacidade (LGPD)
-- Criador: Diego Manhães  Data: 07/05/2026

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version     TEXT DEFAULT '1.0';
