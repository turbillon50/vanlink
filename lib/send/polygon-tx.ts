import {
  encodeFunctionData, erc20Abi, formatUnits, getAddress, isAddress,
  parseTransaction, parseUnits, recoverTransactionAddress, serializeTransaction,
  type Hex,
} from "viem";
import { POLYGON_CHAIN_ID, POLYGON_USDC_ADDRESS, POLYGON_USDC_DECIMALS } from "@/lib/polygon/asset";

export type PolygonTransferQuote = {
  nonce: number;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  usdcBalance: string;
  polBalance: string;
  issuedAt: number;
};

export function normalizePolygonAddress(input: string): `0x${string}` | null {
  const value = input.trim();
  if (!isAddress(value, { strict: false })) return null;
  // Mixed-case addresses require a valid checksum.
  const body = value.slice(2);
  if (body !== body.toLowerCase() && body !== body.toUpperCase() && !isAddress(value, { strict: true })) return null;
  const formatted = getAddress(value);
  return /^0x0{40}$/i.test(formatted) ? null : formatted;
}

export function polygonUSDCUnits(value: string): bigint | null {
  const input = value.replace(",", ".").trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(input)) return null;
  const parsed = parseUnits(input, POLYGON_USDC_DECIMALS);
  return parsed > 0n ? parsed : null;
}

export const formatPolygonUSDC = (value: bigint) => formatUnits(value, POLYGON_USDC_DECIMALS);
export const maxPolygonGas = (quote: PolygonTransferQuote) => BigInt(quote.gas) * BigInt(quote.maxFeePerGas);

export function buildPolygonUSDCUnsigned(params: {
  to: string; amount: bigint; quote: PolygonTransferQuote;
}) {
  const to = normalizePolygonAddress(params.to);
  if (!to || params.amount <= 0n) throw new Error("polygon_invalid_transfer");
  const q = params.quote;
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, params.amount],
  });
  const tx = {
    type: "eip1559" as const,
    chainId: POLYGON_CHAIN_ID,
    nonce: q.nonce,
    to: getAddress(POLYGON_USDC_ADDRESS),
    value: 0n,
    gas: BigInt(q.gas),
    maxFeePerGas: BigInt(q.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(q.maxPriorityFeePerGas),
    data,
  };
  return { unsigned: serializeTransaction(tx), tx };
}

/** The signature must preserve every reviewed field and be from this Turnkey wallet. */
export async function verifyPolygonUSDCSigned(
  signed: string,
  expected: { from: string; unsigned: Hex },
): Promise<Hex> {
  const raw = (signed.startsWith("0x") ? signed : "0x" + signed) as Hex;
  const sent = parseTransaction(raw);
  const planned = parseTransaction(expected.unsigned);
  if (sent.type !== "eip1559" || sent.chainId !== POLYGON_CHAIN_ID) throw new Error("polygon_wrong_chain");
  for (const field of ["to", "value", "data", "nonce", "gas", "maxFeePerGas", "maxPriorityFeePerGas", "chainId"] as const) {
    if (String(sent[field] ?? "") !== String(planned[field] ?? "")) throw new Error("polygon_signed_changed_" + field);
  }
  const from = await recoverTransactionAddress({ serializedTransaction: raw as never });
  if (from.toLowerCase() !== expected.from.toLowerCase()) throw new Error("polygon_wrong_signer");
  return raw;
}
