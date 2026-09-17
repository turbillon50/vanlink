import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const STATEMENTS = [
  sql`CREATE TABLE IF NOT EXISTS wallet_device_requests (
    id text PRIMARY KEY, clerk_user_id text NOT NULL, public_key text NOT NULL,
    code text NOT NULL, label text NOT NULL,
    status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','aprobada','rechazada','expirada')),
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
  sql`CREATE INDEX IF NOT EXISTS wallet_device_requests_user_idx ON wallet_device_requests (clerk_user_id, status)`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS wallet_device_requests_one_pending ON wallet_device_requests (clerk_user_id) WHERE status = 'pendiente'`,
  sql`CREATE TABLE IF NOT EXISTS vanlinks (
    slug text PRIMARY KEY, clerk_user_id text NOT NULL, asset text NOT NULL,
    network text NOT NULL, address text NOT NULL, amount text, concept text,
    status text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','pagado','expirado','cancelado')),
    paid_tx text, paid_at timestamptz, expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now())`,
  sql`CREATE INDEX IF NOT EXISTS vanlinks_user_idx ON vanlinks (clerk_user_id, created_at DESC)`,
  sql`CREATE INDEX IF NOT EXISTS vanlinks_status_idx ON vanlinks (status)`,
];
export async function POST(req: NextRequest) {
  const token = process.env.MIGRATION_TOKEN;
  if (!token || req.headers.get("x-migration-token") !== token) {
    return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
  }
  try {
    for (const s of STATEMENTS) await db().execute(s);
    const check = await db().execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
    const rows = (check as unknown as { rows: { table_name: string }[] }).rows ?? [];
    return NextResponse.json({ ok: true, tablas: rows.map(r => r.table_name) });
  } catch (e) {
    return NextResponse.json({ error: "fallo", detalle: (e as Error).message }, { status: 500 });
  }
}
