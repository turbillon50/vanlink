import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { walletConfigured } from "@/lib/wallet/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Inicia sesión para ver tu wallet." }, { status: 401, headers });
  try {
    const wallet = process.env.DATABASE_URL
      ? (await db().select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0] : undefined;
    return NextResponse.json({ canActivate: walletConfigured(), transfersEnabled: false,
      wallet: wallet ? { organizationId: wallet.organizationId, turnkeyUserId: wallet.turnkeyUserId,
        walletId: wallet.walletId, evmAddress: wallet.evmAddress, bitcoinAddress: wallet.bitcoinAddress,
        networks: ["Base", "Bitcoin"] } : null }, { headers });
  } catch {
    return NextResponse.json({ error: "No pudimos consultar tu wallet. Intenta de nuevo." }, { status: 503, headers });
  }
}
