// market-proxy de VanDeFi — corre en Hetzner porque Bybit bloquea las IPs de Vercel.
// Endpoints (todos piden header x-market-secret = MARKET_PROXY_SECRET):
//   GET /tickers?symbols=BTCUSDT,ETHUSDT  -> { quotes: [{ symbol, price, change24h }] }
//   GET /kline?symbol=BTCUSDT&interval=60&limit=120 -> { symbol, interval, candles: [{ t,o,h,l,c,v }] }
//   GET /fx -> { usdMxn }
//   GET /health -> { ok: true }   (sin secreto)
// Solo datos publicos; no usa llaves de Bybit. Nunca inventa precios: si la fuente falla, responde 502.
import http from "node:http";

const PORT = Number(process.env.PORT || 12050);
const SECRET = process.env.MARKET_PROXY_SECRET || "";
const SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "USDCUSDT"]);
const INTERVALS = new Set(["15", "60", "240", "D"]);
const cache = new Map();

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "vandefi-market-proxy/1.0" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`upstream_${r.status}`);
  return r.json();
}

async function tickers(symbols) {
  const quotes = [];
  for (const symbol of symbols) {
    const q = await cached(`t:${symbol}`, 10_000, async () => {
      const d = await getJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
      const it = d?.result?.list?.[0];
      if (!it) throw new Error("sin_dato");
      return { symbol, price: Number(it.lastPrice), change24h: Number(it.price24hPcnt) * 100 };
    });
    quotes.push(q);
  }
  return { quotes };
}

async function kline(symbol, interval, limit) {
  return cached(`k:${symbol}:${interval}:${limit}`, 15_000, async () => {
    const d = await getJson(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const list = d?.result?.list || [];
    const candles = list.map(([t, o, h, l, c, v]) => ({ t: Number(t), o: Number(o), h: Number(h), l: Number(l), c: Number(c), v: Number(v) })).reverse();
    if (candles.length < 2) throw new Error("sin_velas");
    return { symbol, interval, candles };
  });
}

async function fx() {
  return cached("fx", 600_000, async () => {
    const d = await getJson("https://open.er-api.com/v6/latest/USD");
    const usdMxn = Number(d?.rates?.MXN);
    if (!Number.isFinite(usdMxn)) throw new Error("sin_fx");
    return { usdMxn };
  });
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/health") return send(res, 200, { ok: true });
    if (!SECRET || req.headers["x-market-secret"] !== SECRET) return send(res, 401, { error: "unauthorized" });
    if (url.pathname === "/tickers") {
      const symbols = (url.searchParams.get("symbols") || "").split(",").filter((s) => SYMBOLS.has(s));
      if (!symbols.length) return send(res, 400, { error: "symbols" });
      return send(res, 200, await tickers(symbols));
    }
    if (url.pathname === "/kline") {
      const symbol = url.searchParams.get("symbol") || "";
      const interval = url.searchParams.get("interval") || "60";
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 120), 2), 200);
      if (!SYMBOLS.has(symbol) || !INTERVALS.has(interval)) return send(res, 400, { error: "params" });
      return send(res, 200, await kline(symbol, interval, limit));
    }
    if (url.pathname === "/fx") return send(res, 200, await fx());
    return send(res, 404, { error: "not_found" });
  } catch (e) {
    return send(res, 502, { error: "upstream", detail: String(e.message || e).slice(0, 80) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`market-proxy en 127.0.0.1:${PORT}`));
