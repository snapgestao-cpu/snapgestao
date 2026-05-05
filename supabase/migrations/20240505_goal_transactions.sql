-- Adicionar status e campos de conclusão na tabela goals
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS completion_type TEXT NULL;

-- Histórico de movimentações por meta
CREATE TABLE IF NOT EXISTS goal_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit_external', 'deposit_from_cycle', 'withdrawal_to_cycle')),
  amount DECIMAL(12,2) NOT NULL,
  description TEXT NULL,
  reference_month DATE NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE goal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their goal transactions"
  ON goal_transactions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_goal_transactions_goal
  ON goal_transactions(goal_id, created_at DESC);

CREATE INDEX idx_goal_transactions_user
  ON goal_transactions(user_id, created_at DESC);
