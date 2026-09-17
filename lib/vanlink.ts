import "server-only";
import crypto from "node:crypto";

/** Alfabeto sin caracteres confundibles (0/O, 1/l/I) para dictar un link por teléfono. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newSlug(length = 9) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const ASSETS = {
  BTC: { network: "Bitcoin", decimals: 8, scheme: "bitcoin" },
  USDC: { network: "Base", decimals: 6, scheme: "ethereum" },
  USDT: { network: "Base", decimals: 6, scheme: "ethereum" },
} as const;

export type AssetKey = keyof typeof ASSETS;

/** URI estándar para que la wallet del pagador prellene todo al escanear. */
export function paymentUri(asset: AssetKey, address: string, amount?: string | null) {
  if (asset === "BTC") {
    return amount ? `bitcoin:${address}?amount=${amount}` : `bitcoin:${address}`;
  }
  // EIP-681 para Base (chainId 8453).
  return `ethereum:${address}@8453`;
}

export function isValidAmount(value: string) {
  return /^\d{1,12}(\.\d{1,8})?$/.test(value) && Number(value) > 0;
}
