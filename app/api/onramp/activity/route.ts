/**
 * app/api/onramp/activity/route.ts
 * Endpoint que la pantalla de Actividad consulta para pintar estado real
 * (pendiente/completado/fallido) de las transacciones fiat del usuario.
 *
 * La wallet se obtiene de Clerk y de la relación persistida; nunca de un
 * parámetro de búsqueda proporcionado por quien hace la petición.
 */
import { NextRequest, NextResponse } from "next/server";
import { currentWallet, errorResponse, noStore } from "@/lib/send/server";
import { listFiatActivityForUser } from "@/lib/fiat/activity-store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const wallet = await currentWallet();
    // Ignore public query parameters: only the authenticated account's wallet is accessible.
    const rows = await listFiatActivityForUser(wallet.evmAddress);
    return NextResponse.json({ activity: rows }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
