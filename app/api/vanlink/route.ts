/**
 * app/api/vanlink/route.ts
 * Crear y listar VanLinks de cobro.
 *
 * Un VanLink NO custodia: guarda la dirección del cobrador para que el pagador
 * envíe directo. Por eso funciona aunque el cobrador aún no pueda firmar.
 */
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vanlinks, wallets } from "@/lib/db/schema";
import { ASSETS, isValidAmount, newSlug, type AssetKey } from "@/lib/vanlink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "no_autenticado" }, { status: 401, headers });

  let body: { asset?: string; amount?: string; concept?: string; days?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400, headers });
  }

  const asset = (body.asset || "USDC").toUpperCase() as AssetKey;
  if (!(asset in ASSETS)) {
    return NextResponse.json({ error: "activo_no_soportado" }, { status: 400, headers });
  }
  if (body.amount && !isValidAmount(body.amount)) {
    return NextResponse.json({ error: "monto_invalido" }, { status: 400, headers });
  }

  const wallet = (await db().select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0];
  if (!wallet) return NextResponse.json({ error: "sin_wallet" }, { status: 409, headers });

  const address = asset === "BTC" ? wallet.bitcoinAddress : wallet.evmAddress;
  const days = Math.min(Math.max(Number(body.days) || 7, 1), 90);
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  const [created] = await db().insert(vanlinks).values({
    slug: newSlug(),
    clerkUserId: userId,
    asset,
    network: ASSETS[asset].network,
    address,
    amount: body.amount || null,
    concept: (body.concept || "").slice(0, 80) || null,
    expiresAt,
  }).returning();

  return NextResponse.json({ vanlink: created }, { headers });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "no_autenticado" }, { status: 401, headers });

  const list = await db().select().from(vanlinks)
    .where(eq(vanlinks.clerkUserId, userId))
    .orderBy(desc(vanlinks.createdAt))
    .limit(50);

  return NextResponse.json({ vanlinks: list }, { headers });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "no_autenticado" }, { status: 401, headers });
  let body: { slug?: string; status?: "cancelado" };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400, headers });
  }
  if (!body.slug || body.status !== "cancelado") {
    return NextResponse.json({ error: "parametros_invalidos" }, { status: 400, headers });
  }
  const updated = await db().update(vanlinks).set({ status: "cancelado" })
    .where(and(eq(vanlinks.slug, body.slug), eq(vanlinks.clerkUserId, userId), eq(vanlinks.status, "activo")))
    .returning();
  if (updated.length === 0) {
    return NextResponse.json({ error: "no_vigente" }, { status: 409, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}
