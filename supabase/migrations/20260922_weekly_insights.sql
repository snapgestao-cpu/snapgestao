-- Camada 2 da IA: resumo semanal ("check-in do CFO"). Cacheia o texto gerado 1x
-- por semana por usuário (evita regenerar a cada abertura da aba Gráficos → IA).
-- week_start = segunda-feira da semana coberta (semana = seg a dom do calendário).
CREATE TABLE IF NOT EXISTS weekly_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

ALTER TABLE weekly_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their weekly insights"
  ON weekly_insights
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_weekly_insights_user ON weekly_insights(user_id);
