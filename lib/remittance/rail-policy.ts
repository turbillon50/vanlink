/**
 * VanDeFi Remittance Rail Policy v3 — Polygon USDC only as retail target
 *
 * IMPORTANT: This registry describes both current capabilities and future
 * candidates. "Candidate" is never a deposit or transfer feature. The client
 * MUST NOT show a receiving address unless receiveEnabled is true.
 *
 * Polygon and Base are networks that use the existing Ethereum/EVM address, not separate
 * Turnkey private-key curve. Turnkey supports Ethereum/EVM, Solana, TRON and BTC.
 */
export type RailId = "polygon" | "ethereum" | "base" | "bitcoin";
export type RailFamily = "evm" | "bitcoin";
export type RemittanceAsset = "USDC" | "USDT" | "BTC" | "cbBTC";
export type RailPolicy = Readonly<{
  id: RailId;
  label: string;
  family: RailFamily;
  assets: readonly RemittanceAsset[];
  purpose: "remittance-candidate" | "legacy-compatible" | "advanced";
  receiveEnabled: boolean;
  sendEnabled: boolean;
  fiatPayoutEnabled: boolean;
  notes: string;
}>;

/** This represents the CURRENT audited production behavior, not the vision. */
export const REMITTANCE_RAILS: Readonly<Record<RailId, RailPolicy>> = {
  polygon: {
    id: "polygon", label: "Polygon PoS", family: "evm",
    assets: ["USDC"], purpose: "remittance-candidate",
    receiveEnabled: false, sendEnabled: false, fiatPayoutEnabled: false,
    notes: "Only Circle-native USDC, contract 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359, chainId 137. POL is required for gas. Gate until transfer end-to-end is audited.",
  },
  ethereum: {
    id: "ethereum", label: "Ethereum", family: "evm",
    assets: ["USDC", "USDT"], purpose: "advanced",
    receiveEnabled: false, sendEnabled: false, fiatPayoutEnabled: false,
    notes: "Existing EVM address may be used on Ethereum, but mainnet asset reading and sending are NOT live.",
  },
  base: {
    id: "base", label: "Base", family: "evm",
    assets: ["USDC", "USDT", "cbBTC"], purpose: "legacy-compatible",
    receiveEnabled: true, sendEnabled: true, fiatPayoutEnabled: false,
    notes: "Existing production Base support retained for users with funds; cbBTC is a separately identified wrapped Bitcoin asset, not native BTC.",
  },
  bitcoin: {
    id: "bitcoin", label: "Bitcoin", family: "bitcoin",
    assets: ["BTC"], purpose: "legacy-compatible",
    receiveEnabled: true, sendEnabled: true, fiatPayoutEnabled: false,
    notes: "Native BTC retained; optional funding/holding route, not default for small remittances.",
  },
} as const;

/** Never expose an unsupported deposit network as receiving-ready. */
export function canReceive(id: RailId, asset: RemittanceAsset): boolean {
  const rail = REMITTANCE_RAILS[id];
  return rail.receiveEnabled && rail.assets.includes(asset);
}

/** Never broadcast to a chain with no audited send implementation. */
export function canSend(id: RailId, asset: RemittanceAsset): boolean {
  const rail = REMITTANCE_RAILS[id];
  return rail.sendEnabled && rail.assets.includes(asset);
}

export type RemittanceQuote = Readonly<{
  quoteId: string;
  providerId: string;
  inputAsset: RemittanceAsset;
  inputAmount: string;
  destinationRail: RailId;
  destinationAsset: RemittanceAsset;
  /** Amount equivalent in USD reaching recipient AFTER all disclosed fees. */
  netRecipientUsd: number;
  /** Full cost, including network fee, provider spread and gas/energy. */
  totalFeeUsd: number;
  /** Does not include subsequent local P2P unless provider explicitly quotes it. */
  scope: "crypto-delivery" | "fiat-payout";
  expiresAtMs: number;
  executable: boolean;
  payeeSupportsRail: boolean;
  approvedProvider: boolean;
}>;

export type RoutingRequest = Readonly<{
  inputAsset: RemittanceAsset;
  inputAmount: string;
  nowMs: number;
  allowedRails: readonly RailId[];
  scope: RemittanceQuote["scope"];
}>;

/** Selects only a verified, executable route; never invents a bridge quote. */
export function rankRemittanceQuotes(
  request: RoutingRequest,
  quotes: readonly RemittanceQuote[],
): RemittanceQuote[] {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(request.inputAmount) || Number(request.inputAmount) <= 0) return [];
  const allowed = new Set(request.allowedRails);

  return quotes.filter((quote) =>
    quote.inputAsset === request.inputAsset &&
    quote.inputAmount === request.inputAmount &&
    quote.scope === request.scope &&
    allowed.has(quote.destinationRail) &&
    canSend(quote.destinationRail, quote.destinationAsset) &&
    (request.scope !== "fiat-payout" || REMITTANCE_RAILS[quote.destinationRail].fiatPayoutEnabled) &&
    quote.payeeSupportsRail &&
    quote.approvedProvider &&
    quote.executable &&
    quote.expiresAtMs > request.nowMs &&
    Number.isFinite(quote.netRecipientUsd) && quote.netRecipientUsd >= 0 &&
    Number.isFinite(quote.totalFeeUsd) && quote.totalFeeUsd >= 0
  ).sort((a, b) =>
    b.netRecipientUsd - a.netRecipientUsd ||
    a.totalFeeUsd - b.totalFeeUsd ||
    a.quoteId.localeCompare(b.quoteId)
  );
}
