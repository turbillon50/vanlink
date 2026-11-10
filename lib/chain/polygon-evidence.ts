import { POLYGON_USDT_ADDRESS } from "../polygon/asset";
import { decodePolygonUsdtTransfer, type PolygonLog } from "../polygon/transfer-log";

/** Read-only methods are deliberately the entire capability of this reconciler. */
export type EvidenceMethod = "eth_getTransactionReceipt" | "eth_getTransactionByHash" | "eth_blockNumber" | "eth_getBlockByNumber";
export type EvidenceRpc = <T>(method: EvidenceMethod, params: unknown[]) => Promise<T>;
export type CanonicalTransfer = {
  logIndex: number; sender: string; recipient: string; amountRaw: string; contract: string;
  blockNumber: string; blockHash: string;
};
export type PolygonEvidence = {
  hash: string; walletAddress: string; state: "not_seen" | "pending" | "included" | "confirmed" | "failed" | "investigate";
  related: boolean; transactionSeen: boolean; recipient: string | null; amountRaw: string | null;
  nonce: string | null; blockNumber: string | null; blockHash: string | null; confirmations: string | null;
  canonical: boolean | null; finalized: boolean | null; transferVerified: boolean;
  expectedMatched: boolean | null; reason: string | null; observedAt: string; transfers: CanonicalTransfer[];
};
type Tx = { hash?: string; from?: string; to?: string; nonce?: string; blockNumber?: string | null };
type Receipt = { transactionHash?: string; status?: string; blockNumber?: string; blockHash?: string; logs?: PolygonLog[] };
type Block = { number?: string; hash?: string };
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^0x[0-9a-fA-F]+$/;
const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const integer = (value: unknown): string | null => typeof value === "string" && HEX.test(value) ? BigInt(value).toString() : null;

export async function inspectPolygonEvidence(input: {
  hash: string; walletAddress: string; expected?: { recipient: string; amountRaw: string }; rpc: EvidenceRpc;
}): Promise<PolygonEvidence> {
  if (!HASH.test(input.hash) || !ADDRESS.test(input.walletAddress)) throw new Error("polygon_evidence_invalid_input");
  if (input.expected && (!ADDRESS.test(input.expected.recipient) || !/^[0-9]{1,78}$/.test(input.expected.amountRaw))) {
    throw new Error("polygon_evidence_invalid_expected");
  }
  const hash = input.hash.toLowerCase(), walletAddress = input.walletAddress.toLowerCase();
  // Unsupported finality is missing evidence. Other RPC failures must not erase prior evidence.
  const [receipt, tx, tipHex, finalizedBlock] = await Promise.all([
    input.rpc<Receipt | null>("eth_getTransactionReceipt", [hash]),
    input.rpc<Tx | null>("eth_getTransactionByHash", [hash]),
    input.rpc<string>("eth_blockNumber", []),
    input.rpc<Block | null>("eth_getBlockByNumber", ["finalized", false]).catch(() => null),
  ]);
  if ((tx?.hash && !same(tx.hash, hash)) || (receipt?.transactionHash && !same(receipt.transactionHash, hash))) {
    throw new Error("polygon_evidence_hash_mismatch");
  }
  const tip = integer(tipHex);
  if (tip === null) throw new Error("polygon_evidence_invalid_tip");
  const blockNumber = integer(receipt?.blockNumber);
  const blockHash = receipt?.blockHash && HASH.test(receipt.blockHash) ? receipt.blockHash.toLowerCase() : null;
  const result: PolygonEvidence = {
    hash, walletAddress, state: tx ? "pending" : "not_seen", related: same(tx?.from, walletAddress),
    transactionSeen: Boolean(tx || receipt), recipient: input.expected?.recipient.toLowerCase() ?? null,
    amountRaw: input.expected ? BigInt(input.expected.amountRaw).toString() : null, nonce: integer(tx?.nonce),
    blockNumber, blockHash, confirmations: blockNumber !== null && BigInt(tip) >= BigInt(blockNumber)
      ? (BigInt(tip) - BigInt(blockNumber) + BigInt(1)).toString() : null,
    canonical: null, finalized: null, transferVerified: false, expectedMatched: input.expected ? false : null,
    reason: null, observedAt: new Date().toISOString(), transfers: [],
  };
  if (!receipt) return result;
  if (blockNumber === null || !blockHash) return { ...result, state: "investigate", reason: "receipt_without_block_identity" };
  const canonicalBlock = await input.rpc<Block | null>("eth_getBlockByNumber", [receipt.blockNumber, false]);
  result.canonical = canonicalBlock?.hash && integer(canonicalBlock.number) === blockNumber ? same(canonicalBlock.hash, blockHash) : null;
  if (result.canonical !== true) return { ...result, state: "investigate", reason: result.canonical === false ? "noncanonical_receipt" : "canonical_block_unavailable" };
  const finalizedHeight = integer(finalizedBlock?.number);
  result.finalized = finalizedHeight !== null && BigInt(finalizedHeight)<=BigInt(tip) && finalizedBlock?.hash && HASH.test(finalizedBlock.hash)
    ? BigInt(blockNumber) <= BigInt(finalizedHeight) : null;
  if (receipt.status === "0x0") return { ...result, state: "failed", reason: "execution_reverted" };
  if (receipt.status !== "0x1") return { ...result, state: "investigate", reason: "receipt_status_unknown" };
  const seen = new Set<number>();
  for (const log of receipt.logs ?? []) {
    const transfer = decodePolygonUsdtTransfer(log, POLYGON_USDT_ADDRESS);
    const indexRaw = integer(log.logIndex);
    if (!transfer || transfer.value <= BigInt(0) || indexRaw === null || BigInt(indexRaw) > BigInt(2147483647)) continue;
    if ((log.transactionHash && !same(log.transactionHash, hash)) || (log.blockHash && !same(log.blockHash, blockHash))) continue;
    if (!same(transfer.from, walletAddress) && !same(transfer.to, walletAddress)) continue;
    const logIndex = Number(indexRaw);
    if (seen.has(logIndex)) continue;
    seen.add(logIndex);
    result.transfers.push({ logIndex, sender: transfer.from, recipient: transfer.to, amountRaw: transfer.value.toString(),
      contract: POLYGON_USDT_ADDRESS.toLowerCase(), blockNumber, blockHash });
  }
  result.related ||= result.transfers.length > 0;
  result.transferVerified = result.transfers.length > 0;
  if (input.expected) {
    const matched = result.transfers.find(event => same(event.sender, walletAddress) &&
      same(event.recipient, input.expected!.recipient) && BigInt(event.amountRaw) === BigInt(input.expected!.amountRaw));
    result.expectedMatched = same(tx?.from, walletAddress) && same(tx?.to, POLYGON_USDT_ADDRESS) && Boolean(matched);
    if (matched) { result.recipient = matched.recipient; result.amountRaw = matched.amountRaw; }
    if (!result.expectedMatched) return { ...result, state: "investigate", reason: "journal_transfer_mismatch" };
  } else if (result.transfers.length === 1) {
    result.recipient = result.transfers[0].recipient;
    result.amountRaw = result.transfers[0].amountRaw;
  }
  if (!result.transferVerified) return { ...result, state: "investigate", reason: "usdt_transfer_not_verified" };
  return { ...result, state: result.finalized === true ? "confirmed" : "included", reason: result.finalized === null ? "finality_unavailable" : null };
}
