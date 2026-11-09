/**
 * Cálculo de valor de cartera en USDC de referencia.
 *
 * Solo se reciben saldos verificados en blockchain y cotizaciones de
 * /api/market. No crea activos, ni mueve dinero, ni asume saldos cero cuando
 * falla una red. BTC/cbBTC y ETH se valoran al precio de mercado disponible;
 * USDT ≈ USD y USDC ≈ USD cuando no existe cotización USDC/USDT.
 */
export type BalanceItem = {
  token?: string;
  amount?: string;
  pending?: string;
  error?: string;
};

export type WalletSnapshot = {
  wallet: { evmAddress: string; bitcoinAddress: string } | null;
  base?: { network: string; balances: BalanceItem[] };
  bitcoin?: BalanceItem;
};

export type Quote = { symbol: string; price: number; change?: number | null };
export type MarketSnapshot = {
  quotes: Quote[];
  asOf?: string;
  source?: string;
} | null;

export type PortfolioValuation = {
  totalUsdc: number | null;
  totalUsd: number | null;
  totalBtc: number | null;
  missingBalances: string[];
  missingPrices: string[];
  estimatedStablecoinPeg: boolean;
  estimatedCbbtcPeg: boolean;
  quotedAsOf: string | null;
  source: string | null;
};

const BASE_SYMBOLS = ["USDC", "USDT", "cbBTC", "ETH"] as const;
type BaseSymbol = (typeof BASE_SYMBOLS)[number];

function parseBalance(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function priceOf(market: MarketSnapshot, symbol: string): number | null {
  const row = market?.quotes?.find((quote) => quote.symbol === symbol);
  return typeof row?.price === "number" && Number.isFinite(row.price) && row.price > 0 ? row.price : null;
}

export function valueWallet(snapshot: WalletSnapshot, market: MarketSnapshot): PortfolioValuation {
  const missingBalances: string[] = [];
  const missingPrices: string[] = [];
  const holdings = {} as Record<BaseSymbol | "BTC", number>;

  for (const symbol of BASE_SYMBOLS) {
    const row = snapshot.base?.balances?.find((item) => item.token === symbol);
    const amount = !row?.error && row ? parseBalance(row.amount) : null;
    if (amount === null) missingBalances.push(symbol);
    else holdings[symbol] = amount;
  }

  const btcAmount = !snapshot.bitcoin?.error ? parseBalance(snapshot.bitcoin?.amount) : null;
  if (btcAmount === null) missingBalances.push("BTC");
  else holdings.BTC = btcAmount;

  const btcPrice = priceOf(market, "BTC");
  const ethPrice = priceOf(market, "ETH");
  const quotedUsdcUsdt = priceOf(market, "USDC");
  const usdcUsdt = quotedUsdcUsdt ?? 1; // referencia aproximada en USD/USDT
  const estimatedStablecoinPeg = quotedUsdcUsdt === null;

  if ((holdings.BTC > 0 || holdings.cbBTC > 0) && btcPrice === null) missingPrices.push("BTC");
  if (holdings.ETH > 0 && ethPrice === null) missingPrices.push("ETH");

  const valid = missingBalances.length === 0 && missingPrices.length === 0;
  const totalUsd = valid
    ? holdings.USDC * usdcUsdt +
      holdings.USDT +
      (holdings.BTC + holdings.cbBTC) * (btcPrice ?? 0) +
      holdings.ETH * (ethPrice ?? 0)
    : null;

  return {
    totalUsdc: totalUsd === null ? null : totalUsd / usdcUsdt,
    totalUsd,
    totalBtc: totalUsd !== null && btcPrice !== null ? totalUsd / btcPrice : null,
    missingBalances,
    missingPrices,
    estimatedStablecoinPeg,
    estimatedCbbtcPeg: (holdings.cbBTC ?? 0) > 0,
    quotedAsOf: market?.asOf ?? null,
    source: market?.source ?? null,
  };
}
