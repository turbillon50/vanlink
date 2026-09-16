import "server-only";
import { BASE_USDC, formatBaseUnits } from "@/lib/payments/assets";

/** Read only. No signing or RPC proxy accepting arbitrary user input. */
export async function readBaseUsdcBalance(address: string) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Invalid EVM address");
  const response = await fetch(`https://base-mainnet.g.alchemy.com/v2/${encodeURIComponent(key)}`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: BASE_USDC.address,
        data: `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"] },
    ]),
  });
  if (!response.ok) throw new Error("Balance provider unavailable");
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Invalid balance response");
  const chain = data.find(x => x.id === 1), balance = data.find(x => x.id === 2);
  if (chain?.result !== "0x2105" || balance?.error || !/^0x[0-9a-fA-F]{64}$/.test(balance?.result || "")) throw new Error("Unverified balance");
  return { asset: BASE_USDC, amount: formatBaseUnits(balance.result, BASE_USDC.decimals), observedAt: new Date().toISOString() };
}
