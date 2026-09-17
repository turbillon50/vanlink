type CoinbaseStats = { last: string; open: string };

const pairs = [
  ["BTC", "BTC-USD"],
  ["ETH", "ETH-USD"],
] as const;

// Bybit bloquea las IPs de Vercel por región, así que la fuente primaria es
// nuestro market-proxy en el Hetzner (mismo dato, IP permitida). Si ese
// servicio no responde, caemos a Coinbase, que sí es accesible desde Vercel.
// Nunca se inventa un precio: si ambas fallan, la ruta responde 503.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BYBIT_SYMBOLS = [
  ["BTC", "BTCUSDT"],
  ["ETH", "ETHUSDT"],
  ["USDC", "USDCUSDT"],
] as const;

type Quote = { symbol: string; price: number; change: number };

async function fromProxy(): Promise<Quote[]> {
  const base = process.env.MARKET_PROXY_URL;
  const secret = process.env.MARKET_PROXY_SECRET;
  if (!base || !secret) throw new Error("proxy_no_configurado");

  const symbols = BYBIT_SYMBOLS.map(([, s]) => s).join(",");
  const response = await fetch(`${base}/tickers?symbols=${symbols}`, {
    headers: { "x-market-secret": secret, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`proxy_${response.status}`);

  const data = (await response.json()) as {
    quotes: { symbol: string; price: number; change24h: number }[];
  };
  const bySymbol = new Map(data.quotes.map(q => [q.symbol, q]));

  return BYBIT_SYMBOLS.map(([label, pair]) => {
    const found = bySymbol.get(pair);
    if (!found || !Number.isFinite(found.price)) throw new Error(`proxy_sin_${label}`);
    return { symbol: label, price: found.price, change: found.change24h };
  });
}

async function fromCoinbase(symbol: string, pair: string): Promise<Quote> {
  const response = await fetch(`https://api.exchange.coinbase.com/products/${pair}/stats`, {
    next: { revalidate: 30 },
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`quote_${symbol}_${response.status}`);
  const data = (await response.json()) as CoinbaseStats;
  const price = Number(data.last);
  const open = Number(data.open);
  if (!Number.isFinite(price) || !Number.isFinite(open) || open === 0) {
    throw new Error(`quote_${symbol}_invalid`);
  }
  return { symbol, price, change: ((price - open) / open) * 100 };
}

async function fromProxyFx(): Promise<number | null> {
  const base = process.env.MARKET_PROXY_URL;
  const secret = process.env.MARKET_PROXY_SECRET;
  if (!base || !secret) return null;
  try {
    const response = await fetch(`${base}/fx`, {
      headers: { "x-market-secret": secret, Accept: "application/json" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { usdMxn?: number };
    return Number.isFinite(data.usdMxn) ? (data.usdMxn as number) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [quotes, usdMxn] = await Promise.all([fromProxy(), fromProxyFx()]);
    return Response.json(
      { quotes, usdMxn, asOf: new Date().toISOString(), source: "Bybit" },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45" } },
    );
  } catch {
    // Respaldo: el mercado no debe caerse porque un proveedor falle.
  }

  try {
    const quotes = await Promise.all(pairs.map(([symbol, pair]) => fromCoinbase(symbol, pair)));
    return Response.json(
      { quotes, asOf: new Date().toISOString(), source: "Coinbase Exchange" },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch {
    return Response.json(
      { error: "market_unavailable", message: "No pudimos consultar el mercado en este momento." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
