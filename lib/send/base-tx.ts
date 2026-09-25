/**
 * lib/send/base-tx.ts — armado de envíos en Base (red EVM, chainId 8453).
 *
 * Código puro: navegador y pruebas. NO firma: la firma la pone Turnkey con la
 * llave del dispositivo. Aquí se arma la transacción sin firmar y se verifica
 * la firmada (que el remitente recuperado sea la wallet del usuario) antes de
 * mandarla a la red.
 */
import {
  encodeFunctionData, erc20Abi, getAddress, isAddress, parseUnits, formatUnits,
  serializeTransaction, parseTransaction, recoverTransactionAddress, type Hex,
} from "viem";

export const BASE_CHAIN_ID = 8453;

export const BASE_ASSETS = {
  USDC: { kind: "erc20", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, label: "USDC" },
  USDT: { kind: "erc20", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6, label: "USDT" },
  cbBTC: { kind: "erc20", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8, label: "cbBTC" },
  ETH: { kind: "native", address: null, decimals: 18, label: "ETH" },
} as const;
export type BaseAsset = keyof typeof BASE_ASSETS;
export const isBaseAsset = (v: string): v is BaseAsset => v in BASE_ASSETS;

/** Dirección válida de Base; rechaza la dirección cero y checksums mal escritos. */
export function normalizeEvmAddress(value: string): `0x${string}` | null {
  const v = value.trim();
  if (!isAddress(v, { strict: false })) return null;
  // Si viene con mayúsculas mezcladas, el checksum debe cuadrar (protege contra typos).
  const body = v.slice(2);
  if (body !== body.toLowerCase() && body !== body.toUpperCase() && !isAddress(v, { strict: true })) return null;
  const a = getAddress(v);
  return /^0x0{40}$/i.test(a) ? null : a;
}

export function toUnits(amount: string, asset: BaseAsset): bigint | null {
  const v = amount.trim().replace(",", ".");
  const d = BASE_ASSETS[asset].decimals;
  if (!new RegExp(`^\\d+(\\.\\d{1,${d}})?$`).test(v)) return null;
  const units = parseUnits(v, d);
  return units > BigInt(0) ? units : null;
}
export const fromUnits = (units: bigint, asset: BaseAsset) => formatUnits(units, BASE_ASSETS[asset].decimals);

export type BaseQuote = {
  nonce: number; gas: string; maxFeePerGas: string; maxPriorityFeePerGas: string; ethBalance: string;
};

/** Transacción EIP-1559 sin firmar. value en unidades mínimas (wei o unidades del token). */
export function buildBaseUnsigned(params: { asset: BaseAsset; to: string; value: bigint; quote: BaseQuote }) {
  const to = normalizeEvmAddress(params.to);
  if (!to) throw new Error("direccion_invalida");
  const a = BASE_ASSETS[params.asset];
  const q = params.quote;
  const tx = a.kind === "native"
    ? { to, value: params.value, data: undefined }
    : { to: a.address as `0x${string}`, value: BigInt(0),
        data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, params.value] }) };
  const request = {
    type: "eip1559" as const, chainId: BASE_CHAIN_ID, nonce: q.nonce, gas: BigInt(q.gas),
    maxFeePerGas: BigInt(q.maxFeePerGas), maxPriorityFeePerGas: BigInt(q.maxPriorityFeePerGas), ...tx,
  };
  return { request, unsigned: serializeTransaction(request) };
}

/** Costo máximo de gas en wei. */
export const maxGasCost = (q: BaseQuote) => BigInt(q.gas) * BigInt(q.maxFeePerGas);

/** Verifica la firmada: mismo contenido que se pidió y remitente = wallet del usuario. */
export async function verifyBaseSigned(signed: string, expected: { from: string; unsigned: Hex }) {
  const s = (signed.startsWith("0x") ? signed : "0x" + signed) as Hex;
  const parsed = parseTransaction(s);
  const original = parseTransaction(expected.unsigned);
  for (const k of ["to", "value", "data", "nonce", "gas", "maxFeePerGas", "chainId"] as const) {
    if (String(parsed[k] ?? "") !== String(original[k] ?? "")) throw new Error("firma_altero_" + k);
  }
  const from = await recoverTransactionAddress({ serializedTransaction: s as never });
  if (from.toLowerCase() !== expected.from.toLowerCase()) throw new Error("remitente_no_coincide");
  return s;
}
