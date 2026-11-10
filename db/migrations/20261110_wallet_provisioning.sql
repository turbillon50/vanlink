BEGIN;
-- A missing budget row closes provisioning. Operator sets a cumulative allowance
-- for additional attempts after reconciling historical resources with the provider.
CREATE TABLE IF NOT EXISTS wallet_provision_budget (
  parent_id text PRIMARY KEY,
  max_attempts integer NOT NULL CHECK (max_attempts >= 0)
);
CREATE TABLE IF NOT EXISTS wallet_provision_intents (
  clerk_user_id text PRIMARY KEY,
  parent_id text NOT NULL REFERENCES wallet_provision_budget(parent_id),
  attempt_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  public_key text NOT NULL CHECK (public_key ~ '^(02|03)[0-9a-f]{64}$'),
  organization_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, public_key)
);
CREATE INDEX IF NOT EXISTS wallet_provision_intents_parent ON wallet_provision_intents(parent_id);
COMMIT;
