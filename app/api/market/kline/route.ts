/**
 * app/api/market/kline/route.ts
 * Velas reales desde el market-proxy del Hetzner (Bybit).
 * Bybit bloquea IPs de Vercel; por eso pasamos por nuestro servidor.
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT"]);
const ALLOWED_INTERVALS = new Set(["15", "60", "240", "D"]);

export async function GET(req: NextRequest) {
  const base = process.env.MARKET_PROXY_URL;
  const secret = process.env.MARKET_PROXY_SECRET;
  if (!base || !secret) {
    return Response.json(
      { error: "market_unavailable", message: "Gráfica no disponible." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const symbol = (req.nextUrl.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = req.nextUrl.searchParams.get("interval") || "60";
  if (!ALLOWED_SYMBOLS.has(symbol) || !ALLOWED_INTERVALS.has(interval)) {
    return Response.json({ error: "parametros_invalidos" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${base}/kline?symbol=${symbol}&interval=${interval}&limit=120`,
      {
        headers: { "x-market-secret": secret, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error(`proxy_${response.status}`);
    const data = await response.json();
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45" },
    });
  } catch {
    return Response.json(
      { error: "market_unavailable", message: "No pudimos cargar la gráfica." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
