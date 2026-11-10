CREATE TABLE IF NOT EXISTS vandefi_accounts (
  clerk_user_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
