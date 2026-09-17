/**
 * app/api/chain/balance/route.ts
 * Saldo real en Base de la wallet del usuario autenticado.
 * Sigue el patrón de app/api/wallet/route.ts: Clerk, nodejs, no-store.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { tokenBalance, nativeBalance } from "@/lib/chain/rpc";
import { bitcoinBalance } from "@/lib/chain/bitcoin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Inicia sesión para ver tu saldo." },
      { status: 401, headers }
    );
  }

  let wallet;
  try {
    wallet = process.env.DATABASE_URL
      ? (await db().select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0]
      : undefined;
  } catch {
    return NextResponse.json(
      { error: "No pudimos consultar tu wallet. Intenta de nuevo." },
      { status: 503, headers }
    );
  }

  if (!wallet) {
    return NextResponse.json({ wallet: null, balances: [] }, { headers });
  }

  try {
    // Cada lectura por separado: que Bitcoin falle no debe tumbar Base,
    // ni al revés. Lo que no se pudo leer se marca, no se inventa en cero.
    const [usdc, usdt, cbbtc, eth, btc] = await Promise.allSettled([
      tokenBalance("USDC", wallet.evmAddress),
      tokenBalance("USDT", wallet.evmAddress),
      tokenBalance("cbBTC", wallet.evmAddress),
      nativeBalance(wallet.evmAddress),
      bitcoinBalance(wallet.bitcoinAddress),
    ]);
    const take = (r: PromiseSettledResult<unknown>) =>
      r.status === "fulfilled" ? r.value : { error: "no_disponible" };

    return NextResponse.json(
      {
        wallet: { evmAddress: wallet.evmAddress, bitcoinAddress: wallet.bitcoinAddress },
        base: {
          network: "Base",
          balances: [take(usdc), take(usdt), take(cbbtc), take(eth)],
        },
        bitcoin: take(btc),
      },
      { headers }
    );
  } catch {
    // La red puede fallar; la app no debe tronar por eso.
    return NextResponse.json(
      { error: "No pudimos leer tu saldo en este momento.", balances: [] },
      { status: 503, headers }
    );
  }
}
