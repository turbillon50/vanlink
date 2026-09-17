"use client";

import { useEffect, useState } from "react";

type Quote = {
  symbol: string;
  price: number;
  change: number | null;
};

type MarketResponse = { quotes: Quote[]; asOf: string; source: string; usdMxn?: number | null };

function price(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function pesos(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

export function MarketPulse({ compact = false }: { compact?: boolean }) {
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/market", { cache: "no-store" });
        if (!response.ok) throw new Error("market unavailable");
        const payload = (await response.json()) as MarketResponse;
        if (active) setMarket(payload);
      } catch {
        if (active) setFailed(true);
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (failed) {
    return <p className="market-unavailable">Mercado temporalmente no disponible.</p>;
  }

  if (!market) {
    return <div className="market-skeleton" aria-label="Cargando mercado" />;
  }

  return (
    <div className={compact ? "market-pulse compact" : "market-pulse"}>
      {market.quotes.map((quote) => (
        <div className="quote-row" key={quote.symbol}>
          <div className="quote-identity">
            <span className="quote-orb" aria-hidden="true" />
            <div><strong>{quote.symbol}</strong><small>USD · {market.source}</small></div>
          </div>
          <div className="quote-value">
            <strong>{price(quote.price)}</strong>
            {market.usdMxn ? (
              <small className="quote-mxn">{pesos(quote.price * market.usdMxn)}</small>
            ) : null}
            {quote.change !== null && (
              <small className={quote.change >= 0 ? "up" : "down"}>
                {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)}% · 24 h
              </small>
            )}
          </div>
        </div>
      ))}
      <p className="market-asof">
        Actualizado {new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(market.asOf))}
        {market.usdMxn ? ` · 1 USD = ${market.usdMxn.toFixed(2)} MXN` : ""}
      </p>
    </div>
  );
}
