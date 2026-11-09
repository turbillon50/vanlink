import "server-only";
import { formatUnits, getAddress, isAddress } from "viem";
import { polygonRpc, POLYGON_USDT } from "@/lib/chain/polygon";
import { POLYGON_USDT_DECIMALS, POLYGON_USDT_SYMBOL } from "@/lib/polygon/asset";
import {
  decodePolygonUsdtTransfer, type PolygonLog, type PolygonUsdtTransfer,
} from "@/lib/polygon/transfer-log";

/**
 * Estado REAL de una operación USDT en Polygon (ADR-009) leído de la cadena.
 * Sólo lectura. Nunca se usa symbol() del contrato (devuelve "USDT0").
 */
type Receipt = { status?: string; blockNumber?: string; logs?: PolygonLog[] };
type Tx = { from?: string; to?: string; blockNumber?: string | null };

const HEX = /^0x[0-9a-fA-F]+$/;
const sameAddress = (a: string | undefined, b: string) => Boolean(a) && a!.toLowerCase() === b.toLowerCase();

export async function inspectPolygonHash(hash: string, walletAddress: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("hash_invalido");
  if (!isAddress(walletAddress)) throw new Error("polygon_invalid_address");
  const owner = getAddress(walletAddress);

  const [receipt, tx, tipHex] = await Promise.all([
    polygonRpc<Receipt | null>("eth_getTransactionReceipt", [hash]),
    polygonRpc<Tx | null>("eth_getTransactionByHash", [hash]),
    polygonRpc<string>("eth_blockNumber", []),
  ]);

  const transfers = (receipt?.status === "0x1" ? receipt.logs ?? [] : [])
    .map((log) => decodePolygonUsdtTransfer(log, POLYGON_USDT))
    .filter((t): t is PolygonUsdtTransfer => Boolean(t))
    .filter((t) => t.value > BigInt(0) && (sameAddress(t.from, owner) || sameAddress(t.to, owner)))
    .map((t) => ({
      token: POLYGON_USDT_SYMBOL,
      contract: POLYGON_USDT,
      hash: hash.toLowerCase(),
      from: t.from,
      to: t.to,
      raw: t.value.toString(),
      direction: sameAddress(t.to, owner) ? "in" as const : "out" as const,
      amount: formatUnits(t.value, POLYGON_USDT_DECIMALS),
      counterparty: sameAddress(t.to, owner) ? t.from : t.to,
    }));

  const transactionSeen = Boolean(tx || receipt);
  const related = sameAddress(tx?.from, owner) || transfers.length > 0;
  if (transactionSeen && !related) {
    return { related: false, transactionSeen: true, status: null, block: null, confirmations: null, transfers: [] };
  }
  const tip = HEX.test(tipHex) ? Number(BigInt(tipHex)) : null;
  const block = receipt?.blockNumber && HEX.test(receipt.blockNumber) ? Number(BigInt(receipt.blockNumber)) : null;
  const confirmations = block !== null && tip !== null && tip >= block ? tip - block + 1 : null;
  const status = receipt?.status === "0x1" || receipt?.status === "0x0" ? receipt.status : null;
  return { related, transactionSeen, status, block, confirmations, transfers };
}

export type PolygonMovement = {
  id: string;
  network: "Polygon";
  direction: "in" | "out";
  token: string;
  amount: string;
  counterparty: string | null;
  at: string | null;
  confirmed: boolean;
  explorer: string;
};

type AssetTransfer = {
  hash?: string; from?: string; to?: string; uniqueId?: string;
  rawContract?: { value?: string; address?: string };
  metadata?: { blockTimestamp?: string };
};

async function alchemyTransfers(filter: Record<string, unknown>): Promise<AssetTransfer[]> {
  const key = process.env.ALCHEMY_API_KEY;
  const url = key
    ? "https://polygon-mainnet.g.alchemy.com/v2/" + encodeURIComponent(key)
    : process.env.POLYGON_RPC_URL;
  if (!url?.startsWith("https://")) throw new Error("sin_indexador_polygon");
  const response = await fetch(url, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(9_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      { jsonrpc: "2.0", id: 2, method: "alchemy_getAssetTransfers", params: [{
        fromBlock: "0x0", toBlock: "latest", category: ["erc20"],
        contractAddresses: [POLYGON_USDT], withMetadata: true, excludeZeroValue: true,
        maxCount: "0x32", order: "desc", ...filter,
      }] },
    ]),
  });
  if (!response.ok) throw new Error("polygon_indexador_" + response.status);
  type IndexedResponse = { id?: number; result?: unknown; error?: unknown };
  const data = await response.json() as IndexedResponse[];
  if (!Array.isArray(data)) throw new Error("polygon_indexador_unverified_batch");
  const chain = data.find(item => item.id === 1);
  const result = data.find(item => item.id === 2);
  if (chain?.error || chain?.result !== "0x89") throw new Error("polygon_wrong_chain");
  if (result?.error || !result?.result || typeof result.result !== "object") throw new Error("polygon_indexador_error");
  const transfers = (result.result as { transfers?: unknown }).transfers;
  if (!Array.isArray(transfers)) throw new Error("polygon_indexador_error");
  return transfers as AssetTransfer[];
}

/**
 * Historial USDT Polygon de una dirección. Requiere indexador (Alchemy); sin
 * él lanza error para que la interfaz diga "no disponible" y NUNCA muestre un
 * historial vacío que parezca "sin movimientos".
 */
export async function polygonUsdtMovements(address: string): Promise<PolygonMovement[]> {
  if (!isAddress(address)) throw new Error("polygon_invalid_address");
  const owner = getAddress(address);
  const [received, sent] = await Promise.all([
    alchemyTransfers({ toAddress: owner }),
    alchemyTransfers({ fromAddress: owner }),
  ]);
  const map = (list: AssetTransfer[], direction: "in" | "out"): PolygonMovement[] => list.flatMap((t) => {
    if (!t.hash || !/^0x[0-9a-fA-F]{64}$/.test(t.hash)) return [];
    if (!t.rawContract?.address || t.rawContract.address.toLowerCase() !== POLYGON_USDT.toLowerCase()) return [];
    if (!t.rawContract.value || !HEX.test(t.rawContract.value) || BigInt(t.rawContract.value) <= BigInt(0)) return [];
    // Never trust the indexer's requested filter as an authorization check.
    if (!t.from || !t.to || !isAddress(t.from, { strict: false }) || !isAddress(t.to, { strict: false })) return [];
    if (!sameAddress(direction === "in" ? t.to : t.from, owner)) return [];
    return [{
      id: (t.uniqueId || t.hash) + "-" + direction,
      network: "Polygon" as const,
      direction,
      token: POLYGON_USDT_SYMBOL,
      amount: formatUnits(BigInt(t.rawContract.value), POLYGON_USDT_DECIMALS),
      counterparty: (direction === "in" ? t.from : t.to) ?? null,
      at: t.metadata?.blockTimestamp ?? null,
      confirmed: true,
      explorer: "https://polygonscan.com/tx/" + t.hash.toLowerCase(),
    }];
  });
  return [...map(received, "in"), ...map(sent, "out")];
}
