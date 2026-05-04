-- Histórico de valores por fonte de receita
CREATE TABLE IF NOT EXISTS income_source_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_source_id UUID NOT NULL REFERENCES income_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  valid_from DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(income_source_id, valid_from)
);

ALTER TABLE income_source_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their income history"
  ON income_source_history
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_income_source_history_source_date
  ON income_source_history(income_source_id, valid_from DESC);

CREATE INDEX idx_income_source_history_user
  ON income_source_history(user_id);

-- Seed histórico inicial para fontes existentes
-- valid_from = '2000-01-01' serve como baseline para todos os meses
INSERT INTO income_source_history (income_source_id, user_id, amount, valid_from)
SELECT id, user_id, amount, '2000-01-01'
FROM income_sources
WHERE amount > 0
ON CONFLICT (income_source_id, valid_from) DO NOTHING;
