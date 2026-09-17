/**
 * Estado real de las rampas. Hoy responde no disponible porque la cuenta de
 * Onramper no tiene proveedores habilitados; cuando los tenga, esta ruta lo
 * detecta sola contra /supported y no hay que tocar la UI.
 */
import { NextRequest } from "next/server";
import { isOnramperConfigured, checkOfframpAvailability } from "@/lib/fiat/onramper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const direction = req.nextUrl.searchParams.get("direction") === "down" ? "down" : "up";
  if (!isOnramperConfigured()) {
    return Response.json({ available: false, reason: "sin_configurar" }, { headers });
  }
  if (direction === "down") {
    try {
      const result = await checkOfframpAvailability();
      return Response.json({ available: result.available, reason: result.reason }, { headers });
    } catch {
      return Response.json({ available: false, reason: "no_verificable" }, { headers });
    }
  }
  try {
    const result = await checkOfframpAvailability();
    // Si /supported no devuelve activos, tampoco hay compra disponible.
    return Response.json(
      { available: result.supportedAssets.length > 0, reason: result.reason },
      { headers },
    );
  } catch {
    return Response.json({ available: false, reason: "no_verificable" }, { headers });
  }
}
