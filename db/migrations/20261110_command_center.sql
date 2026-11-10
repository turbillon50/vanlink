-- Additive only. Apply exclusively to an isolated Neon branch during preview.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE TABLE IF NOT EXISTS command_environment (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), environment text NOT NULL CHECK(environment IN ('preview','test')),
 neon_branch_id text NOT NULL, snapshot_at timestamptz NOT NULL DEFAULT now(), migration_version text NOT NULL
);
CREATE TABLE IF NOT EXISTS command_role_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clerk_user_id text NOT NULL, role text NOT NULL CHECK(role IN ('owner','operations','support','auditor')),
 environment text NOT NULL, revoked_at timestamptz, granted_by text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS command_role_active ON command_role_grants(environment,clerk_user_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS command_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), environment text NOT NULL, actor_id text NOT NULL, permission text NOT NULL,
 resource text NOT NULL, reason text NOT NULL, result text NOT NULL, request_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS command_audit_date ON command_audit(environment,created_at DESC,id);
CREATE OR REPLACE FUNCTION command_immutable_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_immutable'; END $$;
DROP TRIGGER IF EXISTS command_audit_immutable ON command_audit;
CREATE TRIGGER command_audit_immutable BEFORE UPDATE OR DELETE ON command_audit FOR EACH ROW EXECUTE FUNCTION command_immutable_audit();
CREATE TABLE IF NOT EXISTS command_action_keys (
 environment text NOT NULL, actor_id text NOT NULL, idempotency_key text NOT NULL, input_hash text NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(environment,actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS command_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), environment text NOT NULL, account_id text, operation_id text, title text NOT NULL,
 priority text NOT NULL CHECK(priority IN ('low','normal','high','urgent')), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','waiting','resolved','closed')),
 assignee text, version integer NOT NULL DEFAULT 1, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS command_cases_account ON command_cases(environment,account_id,created_at DESC);
CREATE TABLE IF NOT EXISTS command_case_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), environment text NOT NULL, case_id uuid NOT NULL REFERENCES command_cases(id), actor_id text NOT NULL, note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS command_incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), environment text NOT NULL, title text NOT NULL, priority text NOT NULL,
 status text NOT NULL DEFAULT 'open', version integer NOT NULL DEFAULT 1, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS command_controls (
 environment text PRIMARY KEY, paused boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS command_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), environment text NOT NULL, account_id text, kind text NOT NULL, source text NOT NULL,
 status text NOT NULL CHECK(status IN ('known','stale','unknown','unavailable')), observed_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS command_observations_latest ON command_observations(environment,kind,account_id,observed_at DESC);
CREATE TABLE IF NOT EXISTS command_transactions (
 environment text NOT NULL, chain_id integer NOT NULL, tx_hash text NOT NULL, account_id text NOT NULL, wallet_address text NOT NULL, recipient text,
 amount_raw numeric(78,0), nonce numeric(78,0), state text NOT NULL, block_number bigint, block_hash text, confirmations bigint, source text NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(), evidence jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(environment,chain_id,tx_hash)
);
CREATE TABLE IF NOT EXISTS command_events (
 environment text NOT NULL, chain_id integer NOT NULL, tx_hash text NOT NULL, log_index integer NOT NULL, block_number bigint NOT NULL, block_hash text NOT NULL,
 sender text NOT NULL, recipient text NOT NULL, amount_raw numeric(78,0) NOT NULL CHECK(amount_raw>=0), contract text NOT NULL, state text NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(environment,chain_id,tx_hash,log_index)
);
CREATE INDEX IF NOT EXISTS command_events_block ON command_events(environment,chain_id,block_number);
CREATE TABLE IF NOT EXISTS command_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), environment text NOT NULL, kind text NOT NULL CHECK(kind IN ('refresh','reconcile')), resource_id text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','retry','failed')), attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid, checkpoint jsonb NOT NULL DEFAULT '{}', result jsonb,
 error_code text, actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS command_jobs_active ON command_jobs(environment,kind,resource_id) WHERE status IN ('queued','running','retry');
CREATE INDEX IF NOT EXISTS command_jobs_available ON command_jobs(environment,status,available_at);
CREATE TABLE IF NOT EXISTS command_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO command_migrations(version) VALUES('20261110_command_center') ON CONFLICT DO NOTHING;
COMMIT;
