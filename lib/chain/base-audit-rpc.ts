import "server-only";
import { BASE_TOKEN_REGISTRY, ERC20_TRANSFER_TOPIC, addressTopic, decodeSupportedTransfer } from "@/lib/chain/base-operations";

const FALLBACKS = [
  "https://base-rpc.publicnode.com",
  "https://base-mainnet.public.blastapi.io",
  "https://base.drpc.org",
];

type RpcRequest = { method: string; params: unknown[] };
type RpcAnswer = { id?: number; result?: unknown; error?: { code?: number; message?: string } };

const isHttps = (url: string) => /^https:\/\//i.test(url);

function providers(): string[] {
  const primary = process.env.BASE_RPC_URL || "";
  return [...new Set([primary, ...FALLBACKS].filter(isHttps))];
}

/**
 * Verifies chain ID in the same JSON-RPC batch as reads, so an incorrectly
 * configured RPC cannot silently return balances/logs from another network.
 *
 * Read-only functions ONLY. Never broadcasts signed transactions through
 * fallbacks, which could introduce ambiguous outcomes after a timeout.
 */
export async function verifiedBaseRead<T>(calls: readonly RpcRequest[]): Promise<T[]> {
  if (!calls.length || calls.length > 30) throw new Error("base_rpc_invalid_batch");
  if (calls.some(c => !/^(?:eth_(?:chainId|blockNumber|call|getLogs|getBlockByNumber|getTransactionReceipt|getTransactionByHash|getBalance|estimateGas|getTransactionCount))$/.test(c.method))) {
    throw new Error("base_rpc_method_not_readonly");
  }
  let last: Error | null = null;
  for (const endpoint of providers()) {
    try {
      const payload = [
        { jsonrpc: "2.0", id: 0, method: "eth_chainId", params: [] },
        ...calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, method: c.method, params: c.params })),
      ];
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(9_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("base_rpc_http_" + response.status);
      const answers = await response.json() as RpcAnswer[];
      if (!Array.isArray(answers)) throw new Error("base_rpc_batch_not_supported");
      const byId = new Map(answers.map((answer) => [answer.id, answer]));
      if (byId.get(0)?.result !== "0x2105") throw new Error("base_rpc_wrong_chain");
      return calls.map((_, i) => {
        const answer = byId.get(i + 1);
        if (!answer || answer.error || answer.result === undefined)
          throw new Error("base_rpc_incomplete_response");
        return answer.result as T;
      });
    } catch (error) {
      last = error instanceof Error ? error : new Error("base_rpc_unavailable");
    }
  }
  throw new Error("base_read_unavailable" + (last ? ":" + last.message.replace(/https?:\/\/\S+/g, "[provider]") : ""));
}

export type RecentBaseMovement = {
  id: string;
  network: "Base";
  direction: "in" | "out";
  token: "USDC" | "USDT" | "cbBTC";
  amount: string;
  counterparty: string | null;
  at: string | null;
  confirmed: boolean;
  explorer: string;
};

type Log = {
  address: string; topics: string[]; data: string; transactionHash?: string;
  blockNumber?: string; logIndex?: string; removed?: boolean;
};

const MAX_RECENT_BLOCKS = 4_000;

export async function recentBaseMovements(address: string): Promise<{
  movements: RecentBaseMovement[];
  scannedBlocks: number;
  scannedFromBlock: number;
  scannedToBlock: number;
}> {
  const topic = addressTopic(address);
  const [tipHex] = await verifiedBaseRead<string>([{ method: "eth_blockNumber", params: [] }]);
  const tip = Number(BigInt(tipHex));
  if (!Number.isSafeInteger(tip) || tip < 0) throw new Error("base_tip_invalid");
  const start = Math.max(0, tip - MAX_RECENT_BLOCKS);
  const filter = { address: Object.keys(BASE_TOKEN_REGISTRY), fromBlock: "0x" + start.toString(16), toBlock: "0x" + tip.toString(16) };

  const [received, sent] = await verifiedBaseRead<Log[]>([
    { method: "eth_getLogs", params: [{ ...filter, topics: [ERC20_TRANSFER_TOPIC, null, topic] }] },
    { method: "eth_getLogs", params: [{ ...filter, topics: [ERC20_TRANSFER_TOPIC, topic] }] },
  ]);

  const transferMap = new Map<string, RecentBaseMovement & { blockNumber: number | null }>();
  for (const [logs, direction] of [[received, "in"], [sent, "out"]] as const) {
    if (!Array.isArray(logs)) throw new Error("base_log_shape");
    for (const raw of logs) {
      const transfer = decodeSupportedTransfer(raw);
      if (!transfer || !transfer.transactionHash || transfer.logIndex === null) continue;
      if (direction === "in" && transfer.to.toLowerCase() !== address.toLowerCase()) continue;
      if (direction === "out" && transfer.from.toLowerCase() !== address.toLowerCase()) continue;
      const key = transfer.transactionHash + ":" + transfer.logIndex;
      if (transferMap.has(key)) continue; // self-payment: do not double count
      transferMap.set(key, {
        id: key, blockNumber: transfer.blockNumber, network: "Base",
        direction,
        token: transfer.asset, amount: transfer.amount,
        counterparty: direction === "in" ? transfer.from : transfer.to,
        at: null, confirmed: true,
        explorer: "https://basescan.org/tx/" + transfer.transactionHash,
      });
    }
  }
  const recent = [...transferMap.values()]
    .sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0))
    .slice(0, 35);
  const blocks = [...new Set(recent.map(x => x.blockNumber).filter((x): x is number => x !== null))].slice(0, 25);
  if (blocks.length) {
    try {
      const blockReplies = await verifiedBaseRead<{ timestamp?: string } | null>(
        blocks.map(block => ({ method: "eth_getBlockByNumber", params: ["0x" + block.toString(16), false] })),
      );
      const timestamps = new Map<number, string>();
      for (let i = 0; i < blocks.length; i++) {
        const raw = blockReplies[i]?.timestamp;
        if (raw && /^0x[0-9a-f]+$/i.test(raw)) {
          timestamps.set(blocks[i], new Date(Number(BigInt(raw)) * 1000).toISOString());
        }
      }
      for (const movement of recent) movement.at = movement.blockNumber === null ? null : timestamps.get(movement.blockNumber) ?? null;
    } catch {
      // No invented timestamps. Transactions still display with their explorer links.
    }
  }
  return {
    movements: recent.map(({ blockNumber: _, ...rest }) => rest),
    scannedBlocks: tip - start + 1, scannedFromBlock: start, scannedToBlock: tip,
  };
}

export type ChainReceipt = {
  status?: string; blockNumber?: string; logs?: Log[];
};

export async function inspectBaseHash(hash: string, walletAddress: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("hash_invalido");
  const owner = addressTopic(walletAddress).slice(-40).toLowerCase();
  const [receipt, tx, tipHex] = await verifiedBaseRead<unknown>([
    { method: "eth_getTransactionReceipt", params: [hash] },
    { method: "eth_getTransactionByHash", params: [hash] },
    { method: "eth_blockNumber", params: [] },
  ]);
  const target = receipt && typeof receipt === "object" ? receipt as ChainReceipt : null;
  const txn = tx && typeof tx === "object" ? tx as { from?: string; to?: string; blockNumber?: string } : null;

  const involvement = (target?.logs ?? []).map(decodeSupportedTransfer).filter(t =>
    t && (t.from.slice(-40).toLowerCase() === owner || t.to.slice(-40).toLowerCase() === owner)
  ).filter((t): t is NonNullable<typeof t> => Boolean(t));

  if (txn && txn.from?.slice(-40).toLowerCase() !== owner && !involvement.length) {
    return { related: false, receipt: null, transactionSeen: true, confirmations: null, transfers: [] };
  }
  const tip = typeof tipHex === "string" && /^0x[0-9a-f]+$/i.test(tipHex) ? Number(BigInt(tipHex)) : null;
  const block = target?.blockNumber && /^0x[0-9a-f]+$/i.test(target.blockNumber) ?
    Number(BigInt(target.blockNumber)) : null;
  const confirmations = block !== null && tip !== null && tip >= block ? tip - block + 1 : null;
  return {
    related: Boolean(txn || involvement.length),
    receipt: target ? { status: target.status, blockNumber: target.blockNumber } : null,
    transactionSeen: Boolean(txn),
    confirmations,
    transfers: involvement.map(x => ({
      token: x.asset, amount: x.amount,
      direction: x.to.toLowerCase() === walletAddress.toLowerCase() ? "in" as const : "out" as const,
      counterparty: x.to.toLowerCase() === walletAddress.toLowerCase() ? x.from : x.to,
    })),
  };
}
