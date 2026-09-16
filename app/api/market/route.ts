type CoinbaseStats = { last: string; open: string };

const pairs = [
  ["BTC", "BTC-USD"],
  ["ETH", "ETH-USD"],
] as const;

// Quotes belong to request time. Keeping this route dynamic prevents a deploy
// from waiting on a third-party market feed during static generation.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getQuote(symbol: string, pair: string) {
  const response = await fetch(`https://api.exchange.coinbase.com/products/${pair}/stats`, {
    next: { revalidate: 30 },
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`quote_${symbol}_${response.status}`);
  const data = (await response.json()) as CoinbaseStats;
  const price = Number(data.last);
  const open = Number(data.open);
  if (!Number.isFinite(price) || !Number.isFinite(open) || open === 0) throw new Error(`quote_${symbol}_invalid`);
  return { symbol, price, change: ((price - open) / open) * 100 };
}

export async function GET() {
  try {
    const quotes = await Promise.all(pairs.map(([symbol, pair]) => getQuote(symbol, pair)));
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
