/**
 * Decodificador puro (sin red, sin secretos) del evento ERC-20
 * Transfer(address,address,uint256). Se comparte entre servidor y pruebas.
 */
export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type PolygonLog = { address?: string; topics?: string[]; data?: string; removed?: boolean };
export type PolygonUsdtTransfer = { from: string; to: string; value: bigint };

const TOPIC_ADDRESS = /^0x0{24}[0-9a-fA-F]{40}$/;

export function decodePolygonUsdtTransfer(log: PolygonLog, contract: string): PolygonUsdtTransfer | null {
  if (!log || log.removed) return null;
  if (typeof log.address !== "string" || log.address.toLowerCase() !== contract.toLowerCase()) return null;
  const topics = log.topics;
  if (!Array.isArray(topics) || topics.length !== 3) return null;
  if (typeof topics[0] !== "string" || topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC) return null;
  if (!TOPIC_ADDRESS.test(topics[1] ?? "") || !TOPIC_ADDRESS.test(topics[2] ?? "")) return null;
  if (typeof log.data !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) return null;
  return {
    from: "0x" + topics[1].slice(-40).toLowerCase(),
    to: "0x" + topics[2].slice(-40).toLowerCase(),
    value: BigInt(log.data),
  };
}
