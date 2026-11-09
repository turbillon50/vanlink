import "server-only";
import { formatUnits, getAddress, isAddress } from "viem";

/** Circle native USDC, NOT bridged USDC.e (0x2791...). */
export const POLYGON_CHAIN_ID = 137;
export const POLYGON_USDC = getAddress("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359");
export const POLYGON_USDC_DECIMALS = 6;
const PUBLIC_RPC = "https://polygon-bor-rpc.publicnode.com";

function endpoint() {
  if (process.env.POLYGON_RPC_URL?.startsWith("https://")) return process.env.POLYGON_RPC_URL;
  if (process.env.ALCHEMY_API_KEY) {
    return "https://polygon-mainnet.g.alchemy.com/v2/" + encodeURIComponent(process.env.ALCHEMY_API_KEY);
  }
  // Read-only bootstrap; use an authenticated private RPC for production scale.
  return PUBLIC_RPC;
}

type RpcResponse<T> = { result?: T; error?: { code?: number; message?: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const body = JSON.stringify([
    { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
    { jsonrpc: "2.0", id: 2, method, params },
  ]);
  const response = await fetch(endpoint(), {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json" }, body,
  });
  if (!response.ok) throw new Error("polygon_rpc_" + response.status);
  const raw = await response.json() as RpcResponse<T>[] | RpcResponse<T>;
  if (!Array.isArray(raw)) throw new Error("polygon_rpc_unverified_batch");
  const chain = raw.find((item) => (item as { id?: number }).id === 1) as RpcResponse<string> | undefined;
  const result = raw.find((item) => (item as { id?: number }).id === 2) as RpcResponse<T> | undefined;
  if (chain?.result !== "0x89") throw new Error("polygon_wrong_chain");
  if (!result || result.error || result.result === undefined) throw new Error("polygon_rpc_error");
  return result.result;
}

function hexBigInt(value: string) {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) throw new Error("polygon_invalid_hex");
  return BigInt(value);
}

export async function readPolygonUSDC(address: string) {
  if (!isAddress(address)) throw new Error("polygon_invalid_address");
  const owner = getAddress(address);
  const input = "0x70a08231" + owner.slice(2).toLowerCase().padStart(64, "0");
  const [amountHex, polHex] = await Promise.all([
    rpc<string>("eth_call", [{ to: POLYGON_USDC, data: input }, "latest"]),
    rpc<string>("eth_getBalance", [owner, "latest"]),
  ]);
  return {
    network: "Polygon",
    token: "USDC",
    contract: POLYGON_USDC,
    amount: formatUnits(hexBigInt(amountHex), POLYGON_USDC_DECIMALS),
    polGasBalance: formatUnits(hexBigInt(polHex), 18),
    observedAt: new Date().toISOString(),
  };
}

export async function polygonRpc<T>(method: string, params: unknown[]): Promise<T> {
  return rpc<T>(method, params);
}
