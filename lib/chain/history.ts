/**
 * lib/chain/history.ts — movimientos reales. SERVER-ONLY.
 * Base vía Alchemy (alchemy_getAssetTransfers); Bitcoin vía Esplora.
 * Cada cadena falla por su cuenta: una caída no borra la otra.
 */
import "server-only";
import { BASE_TOKENS, formatUnits } from "./rpc";
import { recentBaseMovements } from "@/lib/chain/base-audit-rpc";

export type Movement = {
  id: string;
  network: "Polygon" | "Base" | "Bitcoin";
  direction: "in" | "out";
  token: string;
  amount: string;
  counterparty: string | null;
  at: string | null;
  confirmed: boolean;
  verification?: "indexer_only";
  explorer: string;
};

const CONTRACTS = Object.values(BASE_TOKENS).map((t) => t.address);

async function alchemy(method: string, params: unknown[]) {
  const url = process.env.BASE_RPC_URL;
  if (!url || !url.includes("alchemy")) throw new Error("sin_alchemy");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "rpc");
  return data.result;
}

export async function baseMovements(address: string): Promise<Movement[]> {
  const base = {
    fromBlock: "0x0",
    category: ["erc20", "external"],
    withMetadata: true,
    excludeZeroValue: true,
    maxCount: "0x19",
    order: "desc",
    contractAddresses: CONTRACTS,
  };
  const [received, sent] = await Promise.all([
    alchemy("alchemy_getAssetTransfers", [{ ...base, toAddress: address }]),
    alchemy("alchemy_getAssetTransfers", [{ ...base, fromAddress: address }]),
  ]);

  const map = (list: { transfers?: unknown[] }, direction: "in" | "out") =>
    (list.transfers ?? []).map((raw) => {
      const t = raw as {
        hash: string; from: string; to: string; asset?: string; value?: number;
        metadata?: { blockTimestamp?: string };
      };
      return {
        id: `${t.hash}-${direction}`,
        network: "Base" as const,
        direction,
        token: t.asset || "TOKEN",
        amount: String(t.value ?? 0),
        counterparty: direction === "in" ? t.from : t.to,
        at: t.metadata?.blockTimestamp ?? null,
        confirmed: true,
        explorer: `https://basescan.org/tx/${t.hash}`,
      };
    });

  return [...map(received, "in"), ...map(sent, "out")];
}

/**
 * The production BASE_RPC_URL can be a generic JSON-RPC without Alchemy's
 * proprietary getAssetTransfers. Use a clearly LIMITED on-chain window
 * instead of falsely claiming that the user has no activity.
 *
 * VanLink proof-of-payment deliberately continues using the full-indexer
 * function, so old links cannot be marked paid using a partial scan.
 */
export async function baseMovementsWithCoverage(address: string): Promise<{
  movements: Movement[]; limited: boolean; scannedBlocks: number | null;
}> {
  try {
    return { movements: await baseMovements(address), limited: false, scannedBlocks: null };
  } catch {
    const recent = await recentBaseMovements(address);
    return { movements: recent.movements, limited: true, scannedBlocks: recent.scannedBlocks };
  }
}

export async function bitcoinMovements(address: string): Promise<Movement[]> {
  const bases = [
    process.env.BITCOIN_API_URL,
    "https://mempool.space/api",
    "https://blockstream.info/api",
  ].filter((u): u is string => Boolean(u));

  let lastError: Error | undefined;
  for (const base of bases) {
    try {
      const response = await fetch(`${base}/address/${address}/txs`, {
        cache: "no-store",
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error(`esplora_${response.status}`);
      const txs = (await response.json()) as Array<{
        txid: string;
        status: { confirmed: boolean; block_time?: number };
        vin: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
        vout: Array<{ scriptpubkey_address?: string; value?: number }>;
      }>;

      return txs.slice(0, 25).map((tx) => {
        const inSum = tx.vout
          .filter((o) => o.scriptpubkey_address === address)
          .reduce((sum, o) => sum + (o.value ?? 0), 0);
        const outSum = tx.vin
          .filter((i) => i.prevout?.scriptpubkey_address === address)
          .reduce((sum, i) => sum + (i.prevout?.value ?? 0), 0);
        const net = inSum - outSum;
        const direction: "in" | "out" = net >= 0 ? "in" : "out";
        return {
          id: tx.txid,
          network: "Bitcoin" as const,
          direction,
          token: "BTC",
          amount: formatUnits("0x" + Math.abs(net).toString(16), 8),
          counterparty: null,
          at: tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : null,
          confirmed: tx.status.confirmed,
          explorer: `https://mempool.space/tx/${tx.txid}`,
        };
      });
    } catch (error) {
      lastError = error as Error;
      continue;
    }
  }
  throw lastError ?? new Error("sin_proveedor_bitcoin");
}
