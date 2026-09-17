/**
 * lib/chain/rpc.ts — lectura on-chain en Base. SERVER-ONLY.
 *
 * Usa BASE_RPC_URL si está definida (Alchemy u otro proveedor); si no,
 * cae al RPC público de Base. Cambiar de proveedor es cambiar la env,
 * no tocar código.
 */
import "server-only";

const FALLBACK = "https://mainnet.base.org";

/** Tokens leídos por la app. Direcciones verificadas en Base mainnet. */
export const BASE_TOKENS = {
  USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, label: "USDC" },
  USDT: { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6, label: "USDT" },
  cbBTC: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8, label: "cbBTC" },
} as const;

export type BaseTokenKey = keyof typeof BASE_TOKENS;

function rpcUrl(): string {
  return process.env.BASE_RPC_URL || FALLBACK;
}

async function rpc(method: string, params: unknown[]): Promise<string> {
  const response = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RPC ${response.status}`);
  const data = (await response.json()) as { result?: string; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message || "RPC error");
  if (typeof data.result !== "string") throw new Error("RPC sin resultado");
  return data.result;
}

/** Convierte un uint256 hex a decimal legible, sin perder precisión. */
export function formatUnits(hex: string, decimals: number): string {
  const raw = BigInt(hex === "0x" ? "0x0" : hex);
  let base = BigInt(1);
  for (let i = 0; i < decimals; i++) base *= BigInt(10);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** balanceOf(address) de un ERC-20. */
export async function tokenBalance(token: BaseTokenKey, address: string) {
  if (!isAddress(address)) throw new Error("Dirección EVM inválida");
  const { address: contract, decimals, label } = BASE_TOKENS[token];
  const data = `0x70a08231000000000000000000000000${address.slice(2).toLowerCase()}`;
  const result = await rpc("eth_call", [{ to: contract, data }, "latest"]);
  return { token: label, decimals, raw: result, amount: formatUnits(result, decimals) };
}

/** Saldo nativo (ETH en Base) — se ocupa para saber si hay gas. */
export async function nativeBalance(address: string) {
  if (!isAddress(address)) throw new Error("Dirección EVM inválida");
  const result = await rpc("eth_getBalance", [address, "latest"]);
  return { token: "ETH", decimals: 18, raw: result, amount: formatUnits(result, 18) };
}

export async function chainTip(): Promise<number> {
  return parseInt(await rpc("eth_blockNumber", []), 16);
}
