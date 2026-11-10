import { polygonUsdtMoneyEnabled } from "@/lib/polygon/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public release gate. No identity, wallet data, provider URL or credentials. */
export function GET() {
  const enabled = polygonUsdtMoneyEnabled();
  return Response.json({
    network: "polygon", chainId: 137, asset: "USDT",
    sendEnabled: enabled, receiveEnabled: enabled,
  }, { headers: { "Cache-Control": "no-store" } });
}
