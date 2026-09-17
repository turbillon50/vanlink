-- Alta de segundo dispositivo para una wallet existente.
CREATE TABLE IF NOT EXISTS wallet_device_requests (
  id              text PRIMARY KEY,
  clerk_user_id   text NOT NULL,
  public_key      text NOT NULL,
  code            text NOT NULL,
  label           text NOT NULL,
  status          text NOT NULL DEFAULT 'pendiente'
                    CHECK (status IN ('pendiente','aprobada','rechazada','expirada')),
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_device_requests_user_idx
  ON wallet_device_requests (clerk_user_id, status);

-- Una sola solicitud pendiente por usuario: evita que alguien inunde de
-- peticiones y que el dueño apruebe la equivocada por descuido.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_device_requests_one_pending
  ON wallet_device_requests (clerk_user_id) WHERE status = 'pendiente';
