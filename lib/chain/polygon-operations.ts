import "server-only";
import { formatUnits, getAddress, isAddress } from "viem";
import { polygonRpc, POLYGON_USDT } from "@/lib/chain/polygon";
import { POLYGON_USDT_DECIMALS, POLYGON_USDT_SYMBOL } from "@/lib/polygon/asset";
import {
  decodePolygonUsdtTransfer, type PolygonLog, type PolygonUsdtTransfer,
} from "@/lib/polygon/transfer-log";
import { inspectPolygonEvidence } from "./polygon-evidence";

/**
 * Estado REAL de una operación USDT en Polygon (ADR-009) leído de la cadena.
 * Sólo lectura. Nunca se usa symbol() del contrato (devuelve "USDT0").
 */
type Receipt = { status?: string; blockNumber?: string; logs?: PolygonLog[] };
type Tx = { from?: string; to?: string; blockNumber?: string | null };

const HEX = /^0x[0-9a-fA-F]+$/;
const sameAddress = (a: string | undefined, b: string) => Boolean(a) && a!.toLowerCase() === b.toLowerCase();

export async function inspectPolygonHash(hash: string, walletAddress: string, expected?: {recipient:string;amountRaw:string}) {
  const evidence=await inspectPolygonEvidence({hash,walletAddress,expected,rpc:polygonRpc});
  const transfers=evidence.transfers.map(event=>({token:POLYGON_USDT_SYMBOL,contract:event.contract,hash:evidence.hash,
    from:event.sender,to:event.recipient,raw:event.amountRaw,
    direction:sameAddress(event.recipient,walletAddress) ? "in" as const : "out" as const,
    amount:formatUnits(BigInt(event.amountRaw),POLYGON_USDT_DECIMALS),
    counterparty:sameAddress(event.recipient,walletAddress) ? event.sender : event.recipient}));
  return {...evidence,transfers,block:evidence.blockNumber === null ? null : Number(evidence.blockNumber),
    confirmations:evidence.confirmations === null ? null : Number(evidence.confirmations),
    status:evidence.state === "failed" ? "0x0" : evidence.transferVerified ? "0x1" : null};
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
  verification?: "indexer_only";
  explorer: string;
};

type AssetTransfer = {
  hash?: string; from?: string; to?: string; uniqueId?: string;
  rawContract?: { value?: string; address?: string };
  metadata?: { blockTimestamp?: string };
};

export type PolygonIndexedTransfer = { hash:string; from:string; to:string; amountRaw:string; uniqueId:string|null; at:string|null };
/** A fixed block range and explicit continuation make partial coverage reviewable. */
export async function polygonTransfersPage(input: {
  address:string;direction:"in"|"out";fromBlock:string;toBlock:string;pageKey?:string;maxCount?:number;signal?:AbortSignal;
}):Promise<{transfers:PolygonIndexedTransfer[];pageKey?:string}> {
  if (!isAddress(input.address,{strict:false}) || !/^[0-9]+$/.test(input.fromBlock) || !/^[0-9]+$/.test(input.toBlock) ||
    BigInt(input.fromBlock)>BigInt(input.toBlock) || (input.pageKey && input.pageKey.length>2048)) throw new Error("polygon_indexer_invalid_input");
  const key=process.env.ALCHEMY_API_KEY;
  const url=key ? "https://polygon-mainnet.g.alchemy.com/v2/"+encodeURIComponent(key) : process.env.POLYGON_RPC_URL;
  if (!url?.startsWith("https://")) throw new Error("polygon_indexer_unconfigured");
  const response=await fetch(url,{method:"POST",cache:"no-store",signal:input.signal || AbortSignal.timeout(9000),
    headers:{"Content-Type":"application/json"},body:JSON.stringify([
      {jsonrpc:"2.0",id:1,method:"eth_chainId",params:[]},
      {jsonrpc:"2.0",id:2,method:"alchemy_getAssetTransfers",params:[{
        fromBlock:"0x"+BigInt(input.fromBlock).toString(16),toBlock:"0x"+BigInt(input.toBlock).toString(16),
        category:["erc20"],contractAddresses:[POLYGON_USDT],withMetadata:true,excludeZeroValue:true,
        maxCount:"0x"+Math.max(1,Math.min(50,input.maxCount || 25)).toString(16),order:"asc",
        [input.direction === "in" ? "toAddress" : "fromAddress"]:input.address,
        ...(input.pageKey ? {pageKey:input.pageKey} : {}),
      }]},
    ])});
  if (!response.ok) {
    const error=new Error("polygon_indexer_"+response.status) as Error & {retryAfterMs?:number};
    const retry=response.headers.get("retry-after");
    if (retry) {
      const seconds=Number(retry),ms=Number.isFinite(seconds) ? seconds*1000 : Date.parse(retry)-Date.now();
      if (Number.isFinite(ms)) error.retryAfterMs=Math.min(3_600_000,Math.max(1000,ms));
    }
    throw error;
  }
  const batch=await response.json() as Array<{id?:number;result?:unknown;error?:unknown}>;
  if (!Array.isArray(batch) || batch.find(item=>item.id===1)?.result!=="0x89") throw new Error("polygon_wrong_chain");
  const result=batch.find(item=>item.id===2);
  if (result?.error) {
    const message=typeof result.error === "object" && "message" in result.error ? String(result.error.message) : "";
    if (/page.?key|cursor/i.test(message) && /invalid|expired|not found/i.test(message)) throw new Error("polygon_indexer_cursor_expired");
    throw new Error("polygon_indexer_error");
  }
  if (!result?.result || typeof result.result!=="object") throw new Error("polygon_indexer_error");
  const page=result.result as {transfers?:unknown;pageKey?:unknown};
  if (!Array.isArray(page.transfers) || (page.pageKey!==undefined && (typeof page.pageKey!=="string" || page.pageKey.length>2048))) throw new Error("polygon_indexer_invalid_page");
  const transfers:PolygonIndexedTransfer[]=[];
  for (const value of page.transfers as AssetTransfer[]) {
    if (!value.hash || !/^0x[0-9a-f]{64}$/i.test(value.hash) ||
      value.rawContract?.address?.toLowerCase()!==POLYGON_USDT.toLowerCase() ||
      !value.rawContract.value || !HEX.test(value.rawContract.value) || BigInt(value.rawContract.value)<=BigInt(0) ||
      !value.from || !value.to || !isAddress(value.from,{strict:false}) || !isAddress(value.to,{strict:false}) ||
      !sameAddress(input.direction === "in" ? value.to : value.from,input.address)) continue;
    transfers.push({hash:value.hash.toLowerCase(),from:value.from.toLowerCase(),to:value.to.toLowerCase(),
      amountRaw:BigInt(value.rawContract.value).toString(),uniqueId:typeof value.uniqueId === "string" ? value.uniqueId : null,at:value.metadata?.blockTimestamp || null});
  }
  return {transfers,...(page.pageKey ? {pageKey:page.pageKey as string} : {})};
}

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
      // The indexer discovers candidates. Finality and exact events are established by the reconciler.
      confirmed: false,
      verification: "indexer_only" as const,
      explorer: "https://polygonscan.com/tx/" + t.hash.toLowerCase(),
    }];
  });
  const result=new Map<string,PolygonMovement>();
  for (const movement of [...map(received,"in"),...map(sent,"out")]) {
    const key=movement.id.replace(/-(?:in|out)$/,"");
    if (!result.has(key)) result.set(key,movement);
  }
  return [...result.values()];
}
