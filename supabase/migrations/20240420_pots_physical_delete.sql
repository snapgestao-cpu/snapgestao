-- Migrar FK de transactions.pot_id para ON DELETE SET NULL
-- Isso permite deletar fisicamente um pote sem perder o histórico de transações.
-- Transações de ciclos anteriores ficam preservadas com pot_id = null (aparece como "Sem pote").

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_pot_id_fkey,
  ADD CONSTRAINT transactions_pot_id_fkey
    FOREIGN KEY (pot_id)
    REFERENCES public.pots(id)
    ON DELETE SET NULL;
