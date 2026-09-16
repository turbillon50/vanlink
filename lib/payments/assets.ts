/** Assets are identified by chain and address, never by their ticker alone. */
export type PaymentAsset = { chainId: number; address: string; symbol: string; decimals: number; network: string };
export const BASE_USDC: PaymentAsset = {
  chainId: 8453, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6, network: "Base",
};
export const NATIVE_BTC: PaymentAsset = {
  chainId: 20000000000001, address: "bitcoin", symbol: "BTC", decimals: 8, network: "Bitcoin",
};
export function sameAsset(a: PaymentAsset, b: PaymentAsset) {
  return a.chainId === b.chainId && a.address.toLowerCase() === b.address.toLowerCase() && a.decimals === b.decimals;
}
export function toBaseUnits(input: string, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 || !/^\d{1,12}(\.\d{1,18})?$/.test(input)) throw new Error("Invalid amount");
  const [integer, fraction = ""] = input.split(".");
  if (fraction.length > decimals) throw new Error("Amount exceeds asset precision");
  const value = BigInt(integer + fraction.padEnd(decimals, "0"));
  if (value <= BigInt(0)) throw new Error("Amount must be positive");
  return value.toString();
}
export function formatBaseUnits(input: string, decimals: number) {
  const value = BigInt(input).toString().padStart(decimals + 1, "0");
  if (!decimals) return value;
  const fraction = value.slice(-decimals).replace(/0+$/, "");
  return value.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}
