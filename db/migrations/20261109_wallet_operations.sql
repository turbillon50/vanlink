-- Additive migration. Back up production before applying. No signatures or keys.
BEGIN;
CREATE TABLE IF NOT EXISTS wallet_operations (
  id text PRIMARY KEY,
  clerk_user_id text NOT NULL REFERENCES user_wallets(clerk_user_id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  network text NOT NULL CHECK (network = 'polygon'),
  tx_hash text NOT NULL CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
  recipient text NOT NULL CHECK (recipient ~ '^0x[0-9a-f]{40}$'),
  amount_raw text NOT NULL CHECK (amount_raw ~ '^[0-9]{1,78}$' AND amount_raw::numeric > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id = network || ':' || tx_hash),
  CHECK (wallet_address ~ '^0x[0-9a-f]{40}$')
);
CREATE INDEX IF NOT EXISTS wallet_operations_owner_created_idx ON wallet_operations(clerk_user_id, created_at DESC);
COMMIT;
