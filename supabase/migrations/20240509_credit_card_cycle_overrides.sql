-- Overrides pontuais de fechamento/vencimento por ciclo, para cartões cujo
-- fechamento/vencimento varia mês a mês (exceção do ciclo, sem virar o padrão
-- do cartão). closing_day/due_day nulos = mantém o padrão do cartão naquele campo.
CREATE TABLE IF NOT EXISTS credit_card_cycle_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_start DATE NOT NULL,               -- 1º dia do mês afetado (YYYY-MM-01)
  closing_day INT,                          -- nullable = usa o do cartão
  due_day INT,                              -- nullable = usa o do cartão
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(card_id, cycle_start)
);

ALTER TABLE credit_card_cycle_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their card cycle overrides"
  ON credit_card_cycle_overrides
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ccc_overrides_card
  ON credit_card_cycle_overrides(card_id);
