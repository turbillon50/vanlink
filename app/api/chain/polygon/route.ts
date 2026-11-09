import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { readPolygonUSDC } from "@/lib/chain/polygon";
import { polygonUsdcMoneyEnabled } from "@/lib/polygon/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "no_autenticado" }, { status: 401, headers });

  try {
    const wallet = process.env.DATABASE_URL
      ? (await db().select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0]
      : null;
    if (!wallet) return NextResponse.json({ wallet: null, network: "Polygon", receiveEnabled: false, sendEnabled: false }, { headers });

    const value = await readPolygonUSDC(wallet.evmAddress);
    return NextResponse.json({
      wallet: { evmAddress: wallet.evmAddress },
      polygon: value,
      receiveEnabled: polygonUsdcMoneyEnabled(),
      sendEnabled: polygonUsdcMoneyEnabled(),
    }, { headers });
  } catch (error) {
    // Do not turn network / provider errors into false 0 balances.
    console.error("polygon_balance_failed", { code: (error as Error)?.message?.slice(0, 60) });
    return NextResponse.json({ error: "polygon_balance_unavailable" }, { status: 503, headers });
  }
}
