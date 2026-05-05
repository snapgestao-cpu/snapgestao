-- Reserva de emergência do usuário
CREATE TABLE IF NOT EXISTS emergency_reserve (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  target_amount DECIMAL(12,2) NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE emergency_reserve ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their emergency reserve"
  ON emergency_reserve
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Histórico de movimentações da reserva
CREATE TABLE IF NOT EXISTS emergency_reserve_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit_external', 'deposit_from_cycle', 'withdrawal_to_cycle')),
  amount DECIMAL(12,2) NOT NULL,
  description TEXT NULL,
  reference_month DATE NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE emergency_reserve_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their emergency reserve transactions"
  ON emergency_reserve_transactions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_emergency_reserve_transactions_user
  ON emergency_reserve_transactions(user_id, created_at DESC);
