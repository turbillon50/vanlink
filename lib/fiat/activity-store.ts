/**
 * lib/fiat/activity-store.ts
 * Persistencia de actividad fiat (Onramper) — SERVER-ONLY.
 *
 * ASUNCIÓN A VERIFICAR CONTRA EL REPO REAL: no tengo acceso a
 * /root/codex-work/vanlink, así que no sé si el proyecto usa
 * @neondatabase/serverless directo, Drizzle o Prisma para hablar con Neon.
 * Aquí implementé con @neondatabase/serverless (el patrón más común en el
 * stack Vercel+Neon de Luis) contra dos tablas nuevas (migración incluida
 * en migrations/2026_add_fiat_activity.sql). Si el repo ya usa un ORM,
 * hay que portar upsertFiatActivity/listFiatActivity a ese cliente — la
 * LÓGICA de idempotencia (abajo) es lo que importa conservar, no el driver.
 */
import "server-only";
import crypto from "node:crypto";
import { sqlClient } from "./sql-client";
import type { FiatActivityRecord, OnramperWebhookPayload } from "./types";

function db() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "activity-store: falta DATABASE_URL — no se puede persistir actividad fiat."
    );
  }
  return sqlClient();
}

/** Hash determinístico del payload crudo, para detectar reintentos exactos. */
export function webhookEventHash(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export type PersistResult =
  | { outcome: "inserted"; record: FiatActivityRecord }
  | { outcome: "updated"; record: FiatActivityRecord }
  | { outcome: "duplicate_ignored"; eventHash: string }
  | { outcome: "stale_ignored"; reason: string };

/**
 * Persiste (o ignora, si ya se procesó) un evento de webhook, de forma
 * IDEMPOTENTE en dos niveles:
 *
 *  1. fiat_webhook_events: unique(event_hash) sobre el sha256 del body
 *     crudo completo. Si el mismo POST llega dos veces byte-por-byte
 *     (reintento de Onramper), la segunda vez se detecta aquí y se sale
 *     sin tocar la tabla de actividad.
 *  2. fiat_activity: unique(transaction_id). Un mismo transactionId puede
 *     legítimamente llegar varias veces con statusDate distinto (new ->
 *     pending -> completed). Se hace UPSERT y solo se avanza el status si
 *     el nuevo statusDate es >= al guardado, para no pisar un "completed"
 *     con un "pending" que llegó tarde y desordenado.
 */
export async function persistOnramperWebhookEvent(
  rawBody: string,
  payload: OnramperWebhookPayload
): Promise<PersistResult> {
  const sql = db();
  const eventHash = webhookEventHash(rawBody);

  // Nivel 1: dedupe exacto de la entrega del webhook.
  const inserted = await sql`
    INSERT INTO fiat_webhook_events (event_hash, transaction_id, received_at, raw_body)
    VALUES (${eventHash}, ${payload.transactionId}, now(), ${rawBody})
    ON CONFLICT (event_hash) DO NOTHING
    RETURNING event_hash
  `;

  if (inserted.length === 0) {
    return { outcome: "duplicate_ignored", eventHash };
  }

  const { mapOnramperStatus } = await import("./types");
  const status = mapOnramperStatus(payload.status);
  const direction: "buy" | "sell" =
    payload.transactionType === "sell" || payload.transactionType === "offramp"
      ? "sell"
      : "buy";

  // Nivel 2: upsert de la actividad, sin regresar un status más "avanzado"
  // a uno más viejo si los eventos llegan fuera de orden.
  const rows = await sql`
    INSERT INTO fiat_activity (
      transaction_id, direction, asset, network, status, status_date,
      status_reason, fiat_amount, fiat_currency, crypto_amount,
      wallet_address, raw
    ) VALUES (
      ${payload.transactionId}, ${direction}, ${payload.targetCurrency}, ${null},
      ${status}, ${payload.statusDate}, ${payload.statusReason ?? null},
      ${payload.inAmount ?? null}, ${payload.sourceCurrency ?? null},
      ${payload.outAmount ?? null}, ${payload.walletAddress ?? null},
      ${JSON.stringify(payload)}
    )
    ON CONFLICT (transaction_id) DO UPDATE SET
      status = CASE
        WHEN EXCLUDED.status_date >= fiat_activity.status_date THEN EXCLUDED.status
        ELSE fiat_activity.status
      END,
      status_date = CASE
        WHEN EXCLUDED.status_date >= fiat_activity.status_date THEN EXCLUDED.status_date
        ELSE fiat_activity.status_date
      END,
      status_reason = CASE
        WHEN EXCLUDED.status_date >= fiat_activity.status_date THEN EXCLUDED.status_reason
        ELSE fiat_activity.status_reason
      END,
      raw = CASE
        WHEN EXCLUDED.status_date >= fiat_activity.status_date THEN EXCLUDED.raw
        ELSE fiat_activity.raw
      END
    RETURNING transaction_id, direction, asset, network, status, status_date,
              status_reason, fiat_amount, fiat_currency, crypto_amount,
              wallet_address, raw
  `;

  const row = rows[0] as any;
  const record: FiatActivityRecord = {
    transactionId: row.transaction_id,
    userId: null, // ver TODO abajo
    direction: row.direction,
    asset: row.asset,
    network: row.network,
    status: row.status,
    statusDate: row.status_date,
    statusReason: row.status_reason,
    fiatAmount: row.fiat_amount,
    fiatCurrency: row.fiat_currency,
    cryptoAmount: row.crypto_amount,
    walletAddress: row.wallet_address,
    raw: row.raw,
  };

  // TODO(integración): el payload de Onramper no trae tu userId interno,
  // solo walletAddress. Para poblar user_id en fiat_activity hay que
  // resolver walletAddress -> userId contra la tabla de wallets Turnkey
  // (join o lookup aquí mismo) antes o después del insert. No lo hice
  // porque no conozco el nombre real de esa tabla en tu schema de Neon.
  return { outcome: inserted.length > 0 ? "inserted" : "updated", record };
}

export async function listFiatActivityForUser(walletAddress: string) {
  const sql = db();
  return sql`
    SELECT transaction_id, direction, asset, status, status_date,
           status_reason, fiat_amount, fiat_currency, crypto_amount
    FROM fiat_activity
    WHERE wallet_address = ${walletAddress}
    ORDER BY status_date DESC
    LIMIT 100
  `;
}
