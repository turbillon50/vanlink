import { formatUnits, getAddress, isAddress } from "viem";

/**
 * An ERC-20 transfer verified from the chain receipt/logs, never inferred
 * from the symbol, explorer URL, or a frontend success toast.
 */
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a3df523b3ef";

export const BASE_TOKEN_REGISTRY = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
  "0xfde4c96c8593536e31f229ea8f37b2adA2699bb2".toLowerCase(): { symbol: "USDT", decimals: 6 },
  "0xcbb7c0000ab88b473b1f5afD9ef808440eed33Bf".toLowerCase(): { symbol: "cbBTC", decimals: 8 },
} as const;

export type BaseTransferLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash?: string;
  blockNumber?: string;
  logIndex?: string;
  removed?: boolean;
};

export type ParsedTransfer = {
  asset: "USDC" | "USDT" | "cbBTC";
  contract: string;
  from: string;
  to: string;
  raw: bigint;
  amount: string;
  transactionHash: string | null;
  blockNumber: number | null;
  logIndex: number | null;
};

function topicAddress(topic: string): string | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic) || !/^0{24}/.test(topic.slice(2).toLowerCase())) return null;
  const result = "0x" + topic.slice(-40);
  try { return getAddress(result); } catch { return null; }
}

export function addressTopic(address: string): string {
  if (!isAddress(address, { strict: false })) throw new Error("direccion_invalida");
  return "0x" + getAddress(address).slice(2).toLowerCase().padStart(64, "0");
}

export function decodeSupportedTransfer(log: BaseTransferLog): ParsedTransfer | null {
  if (log.removed || !log.address || log.topics?.length !== 3 ||
      log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC ||
      !/^0x[0-9a-fA-F]{64}$/.test(log.data)) return null;
  const token = BASE_TOKEN_REGISTRY[log.address.toLowerCase() as keyof typeof BASE_TOKEN_REGISTRY];
  if (!token) return null;
  const from = topicAddress(log.topics[1]);
  const to = topicAddress(log.topics[2]);
  if (!from || !to) return null;
  const raw = BigInt(log.data);
  if (raw <= BigInt(0)) return null;
  const transactionHash = /^0x[0-9a-fA-F]{64}$/.test(log.transactionHash ?? "") ? log.transactionHash!.toLowerCase() : null;
  const blockNumber = /^0x[0-9a-fA-F]+$/.test(log.blockNumber ?? "") ? Number(BigInt(log.blockNumber!)) : null;
  const logIndex = /^0x[0-9a-fA-F]+$/.test(log.logIndex ?? "") ? Number(BigInt(log.logIndex!)) : null;
  return {
    asset: token.symbol,
    contract: log.address,
    from, to, raw,
    amount: formatUnits(raw, token.decimals),
    transactionHash, blockNumber, logIndex,
  };
}

export type TxPhase = "not_seen" | "confirming" | "confirmed" | "failed" | "unavailable";

export function interpretEvmReceipt(
  receipt: { status?: string; blockNumber?: string } | null,
  currentBlock: number | null,
): { phase: TxPhase; confirmed: boolean; failed: boolean; confirmations: number | null; block: number | null } {
  if (!receipt) return { phase: "not_seen", confirmed: false, failed: false, confirmations: 0, block: null };
  const included = /^0x[0-9a-fA-F]+$/.test(receipt.blockNumber ?? "") ?
    Number(BigInt(receipt.blockNumber!)) : null;
  const confirmations = included !== null && currentBlock !== null && currentBlock >= included
    ? currentBlock - included + 1 : null;
  if (receipt.status === "0x0") return { phase: "failed", confirmed: false, failed: true, confirmations, block: included };
  if (receipt.status === "0x1") return {
    phase: confirmations === null || confirmations < 1 ? "confirming" : "confirmed",
    confirmed: confirmations !== null && confirmations >= 1,
    failed: false, confirmations, block: included,
  };
  return { phase: "confirming", confirmed: false, failed: false, confirmations, block: included };
}

export function tokenForTransfer(recipient: string, logs: BaseTransferLog[]) {
  if (!isAddress(recipient, { strict: false })) throw new Error("direccion_invalida");
  return logs.map(decodeSupportedTransfer).filter((t): t is ParsedTransfer => Boolean(t))
    .filter((t) => t.to.toLowerCase() === recipient.toLowerCase());
}
