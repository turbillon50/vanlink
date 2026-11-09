import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { baseMovementsWithCoverage, bitcoinMovements, type Movement } from "@/lib/chain/history";
import { polygonUsdtMovements } from "@/lib/chain/polygon-operations";
import { serverTrackedOperations } from "@/lib/operations/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
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
  if (!wallet) return NextResponse.json({ wallet: null, movements: [], trackedOperations: [] }, { headers });

  // Restore the journal without waiting for three independent chain indexers.
  if (new URL(request.url).searchParams.get("trackedOnly") === "1") {
    try {
      return NextResponse.json({
        trackedOperations: await serverTrackedOperations(userId, wallet.evmAddress),
        trackedOperationsUnavailable: false,
      }, { headers });
    } catch {
      return NextResponse.json({ trackedOperations: [], trackedOperationsUnavailable: true }, { status: 503, headers });
    }
  }

  const [base, btc, polygon, tracked] = await Promise.allSettled([
    baseMovementsWithCoverage(wallet.evmAddress),
    bitcoinMovements(wallet.bitcoinAddress),
    polygonUsdtMovements(wallet.evmAddress),
    serverTrackedOperations(userId, wallet.evmAddress),
  ]);

  const movements: Movement[] = [
    ...(polygon.status === "fulfilled" ? polygon.value : []),
    ...(base.status === "fulfilled" ? base.value.movements : []),
    ...(btc.status === "fulfilled" ? btc.value : []),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return NextResponse.json(
    {
      wallet: { evmAddress: wallet.evmAddress, bitcoinAddress: wallet.bitcoinAddress },
      movements,
      trackedOperations: tracked.status === "fulfilled" ? tracked.value : [],
      trackedOperationsUnavailable: tracked.status === "rejected",
      baseRecentOnly: base.status === "fulfilled" ? base.value.limited : false,
      baseScannedBlocks: base.status === "fulfilled" ? base.value.scannedBlocks : null,
      // Declare failed networks instead of presenting an empty, successful history.
      unavailable: [
        polygon.status === "rejected" ? "Polygon" : null,
        base.status === "rejected" ? "Base" : null,
        btc.status === "rejected" ? "Bitcoin" : null,
      ].filter(Boolean),
    },
    { headers },
  );
}
