/**
 * app/api/onramp/activity/route.ts
 * Endpoint que la pantalla de Actividad consulta para pintar estado real
 * (pendiente/completado/fallido) de las transacciones fiat del usuario.
 *
 * INTEGRACIÓN PENDIENTE: obtener la wallet del usuario autenticado. Aquí
 * lo dejo vía query param `?wallet=0x...` como placeholder explícito —
 * en el repo real esto debe salir de la sesión (igual que el resto de
 * VanDeFi resuelve al usuario logueado), no de un query param público.
 */
import { NextRequest, NextResponse } from "next/server";
import { listFiatActivityForUser } from "@/lib/fiat/activity-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "missing_wallet" }, { status: 400 });
  }

  try {
    const rows = await listFiatActivityForUser(wallet);
    return NextResponse.json({ activity: rows });
  } catch (err) {
    console.error("[onramp/activity] error:", err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
