/**
 * app/api/admin/migrate/route.ts
 * Endpoint TEMPORAL de migración. Aplica db/migrations/2026_add_fiat_activity.sql
 * usando la conexión que ya tiene la app. Protegido por MIGRATION_TOKEN.
 * BORRAR después de correrlo una vez.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATEMENTS = [
  sql`CREATE TABLE IF NOT EXISTS fiat_webhook_events (
    event_hash text PRIMARY KEY,
    transaction_id text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    raw_body text NOT NULL)`,
  sql`CREATE INDEX IF NOT EXISTS fiat_webhook_events_tx_idx ON fiat_webhook_events (transaction_id)`,
  sql`CREATE TABLE IF NOT EXISTS fiat_activity (
    transaction_id text PRIMARY KEY,
    user_id text,
    direction text NOT NULL CHECK (direction IN ('buy','sell')),
    asset text NOT NULL,
    network text,
    status text NOT NULL CHECK (status IN ('pendiente','completado','fallido')),
    status_date timestamptz NOT NULL,
    status_reason text,
    fiat_amount numeric,
    fiat_currency text,
    crypto_amount numeric,
    wallet_address text,
    raw jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now())`,
  sql`CREATE INDEX IF NOT EXISTS fiat_activity_wallet_idx ON fiat_activity (wallet_address)`,
  sql`CREATE INDEX IF NOT EXISTS fiat_activity_status_date_idx ON fiat_activity (status_date DESC)`,
];

export async function POST(req: NextRequest) {
  const token = process.env.MIGRATION_TOKEN;
  if (!token || req.headers.get("x-migration-token") !== token) {
    return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
  }
  const done: string[] = [];
  try {
    for (const [i, statement] of STATEMENTS.entries()) {
      await db().execute(statement);
      done.push(`sentencia_${i + 1}`);
    }
    const check = await db().execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`);
    const rows = (check as unknown as { rows: { table_name: string }[] }).rows ?? [];
    return NextResponse.json({ ok: true, aplicadas: done, tablas: rows.map(r => r.table_name) });
  } catch (error) {
    return NextResponse.json(
      { error: "fallo", detalle: (error as Error).message, aplicadas: done },
      { status: 500 }
    );
  }
}
