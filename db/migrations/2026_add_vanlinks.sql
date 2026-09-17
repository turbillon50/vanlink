CREATE TABLE IF NOT EXISTS vanlinks (
  slug            text PRIMARY KEY,
  clerk_user_id   text NOT NULL,
  asset           text NOT NULL,
  network         text NOT NULL,
  address         text NOT NULL,
  amount          text,
  concept         text,
  status          text NOT NULL DEFAULT 'activo'
                    CHECK (status IN ('activo','pagado','expirado','cancelado')),
  paid_tx         text,
  paid_at         timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vanlinks_user_idx ON vanlinks (clerk_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vanlinks_status_idx ON vanlinks (status);
