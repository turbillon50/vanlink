CREATE TABLE IF NOT EXISTS user_wallets (
  clerk_user_id text PRIMARY KEY,
  organization_id text NOT NULL UNIQUE,
  wallet_id text NOT NULL UNIQUE,
  turnkey_user_id text NOT NULL,
  evm_address text NOT NULL UNIQUE,
  bitcoin_address text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wallet_oauth_flows (
  clerk_user_id text PRIMARY KEY,
  state_hash text NOT NULL UNIQUE,
  public_key text NOT NULL,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_oauth_expiry ON wallet_oauth_flows (expires_at);
