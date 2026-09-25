/** TEMPORAL — identifica la cuenta de Clerk dueña de una wallet. Se borra tras usarse una vez. */
import { createHash, timingSafeEqual } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HASH = "3840d04d9e0a9d325bddf7f712890a8450676997f1f46941891d8e10497e97b8";

export async function GET(req: Request) {
  const t = req.headers.get("x-lookup-token") ?? "";
  const got = createHash("sha256").update(t).digest();
  if (!timingSafeEqual(got, Buffer.from(HASH, "hex"))) return Response.json({ error: "no" }, { status: 404 });
  const rows = (await db().execute(sql`select clerk_user_id, evm_address, bitcoin_address, created_at from user_wallets order by created_at`)) as unknown as { rows: Record<string, string>[] };
  const client = await clerkClient();
  const out = [];
  for (const r of rows.rows) {
    const u = await client.users.getUser(r.clerk_user_id).catch(() => null);
    out.push({ evm: r.evm_address, btc: r.bitcoin_address, walletCreated: r.created_at,
      emails: u?.emailAddresses.map(e => e.emailAddress) ?? null, primary: u?.primaryEmailAddress?.emailAddress ?? null,
      providers: u?.externalAccounts.map(a => `${a.provider}:${a.emailAddress}`) ?? null,
      username: u?.username ?? null, name: u ? [u.firstName, u.lastName].filter(Boolean).join(" ") : null,
      lastSignIn: u?.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : null });
  }
  return Response.json({ wallets: out }, { headers: { "Cache-Control": "no-store" } });
}
