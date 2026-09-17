import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { baseMovements, bitcoinMovements, type Movement } from "@/lib/chain/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Inicia sesión para ver tu actividad." }, { status: 401, headers });
  }

  let wallet;
  try {
    wallet = process.env.DATABASE_URL
      ? (await db().select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0]
      : undefined;
  } catch {
    return NextResponse.json({ error: "No pudimos consultar tu wallet." }, { status: 503, headers });
  }
  if (!wallet) return NextResponse.json({ wallet: null, movements: [] }, { headers });

  const [base, btc] = await Promise.allSettled([
    baseMovements(wallet.evmAddress),
    bitcoinMovements(wallet.bitcoinAddress),
  ]);

  const movements: Movement[] = [
    ...(base.status === "fulfilled" ? base.value : []),
    ...(btc.status === "fulfilled" ? btc.value : []),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return NextResponse.json(
    {
      wallet: { evmAddress: wallet.evmAddress, bitcoinAddress: wallet.bitcoinAddress },
      movements,
      // Se declara qué red no se pudo leer: nunca un vacío que parezca "sin movimientos".
      unavailable: [
        base.status === "rejected" ? "Base" : null,
        btc.status === "rejected" ? "Bitcoin" : null,
      ].filter(Boolean),
    },
    { headers },
  );
}
