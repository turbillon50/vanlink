import "server-only";
import type { PaymentAsset } from "@/lib/payments/assets";

type CatalogToken = { chainId: number; address: string; symbol: string; decimals: number };
/** This catalog is discovery, not a quote or a promise of route availability. */
export async function supportedPaymentAssets(chainIds: number[]): Promise<CatalogToken[]> {
  if (!chainIds.length || chainIds.length > 10 || chainIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error("Invalid chains");
  const url = new URL("https://li.quest/v1/tokens");
  url.searchParams.set("chains", chainIds.join(","));
  const headers: Record<string, string> = {};
  if (process.env.LIFI_API_KEY) headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("Asset catalog unavailable");
  const data = await response.json() as { tokens: Record<string, CatalogToken[]> };
  return Object.values(data.tokens).flat().filter(token => chainIds.includes(token.chainId) &&
    ["USDC", "USDT", "BTC"].includes(token.symbol));
}

export function validateCatalogAsset(asset: PaymentAsset, catalog: CatalogToken[]) {
  return catalog.some(token => token.chainId === asset.chainId && token.address.toLowerCase() === asset.address.toLowerCase()
    && token.decimals === asset.decimals && token.symbol === asset.symbol);
}
