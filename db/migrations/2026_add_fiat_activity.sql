-- migrations/2026_add_fiat_activity.sql
-- Tablas nuevas para la capa fiat (Onramper) de VanDeFi.
-- Correr contra el Neon de vandefi.live (branch production) antes de
-- desplegar la ruta del webhook.

CREATE TABLE IF NOT EXISTS fiat_webhook_events (
  event_hash      text PRIMARY KEY,
  transaction_id  text NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  raw_body        text NOT NULL
);

CREATE INDEX IF NOT EXISTS fiat_webhook_events_tx_idx
  ON fiat_webhook_events (transaction_id);

CREATE TABLE IF NOT EXISTS fiat_activity (
  transaction_id  text PRIMARY KEY,
  user_id         text,               -- NULL hasta resolver wallet->usuario (ver TODO en activity-store.ts)
  direction       text NOT NULL CHECK (direction IN ('buy', 'sell')),
  asset           text NOT NULL,
  network         text,
  status          text NOT NULL CHECK (status IN ('pendiente', 'completado', 'fallido')),
  status_date     timestamptz NOT NULL,
  status_reason   text,
  fiat_amount     numeric,
  fiat_currency   text,
  crypto_amount   numeric,
  wallet_address  text,
  raw             jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiat_activity_wallet_idx
  ON fiat_activity (wallet_address);

CREATE INDEX IF NOT EXISTS fiat_activity_status_date_idx
  ON fiat_activity (status_date DESC);
