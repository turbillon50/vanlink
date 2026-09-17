"use client";

/**
 * components/market-chart.tsx
 * Gráfica real de velas/área con datos de Bybit vía nuestro proxy.
 *
 * Criterio de acabado: sin librerías pesadas, SVG propio. El trazo se dibuja
 * con stroke-dashoffset (sensación de "se está pintando"), el scrub sigue el
 * dedo o el cursor con crosshair, y el precio de cabecera cambia al arrastrar.
 * Nada de datos inventados: si el proveedor falla, se dice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
type KlineResponse = { symbol: string; interval: string; candles: Candle[] };

const RANGES = [
  { id: "15", label: "4H", hint: "velas de 15 min" },
  { id: "60", label: "24H", hint: "velas de 1 hora" },
  { id: "240", label: "7D", hint: "velas de 4 horas" },
  { id: "D", label: "3M", hint: "velas diarias" },
] as const;

const W = 660;
const H = 240;
const PAD_Y = 18;

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function timeLabel(ms: number, interval: string) {
  const date = new Date(ms);
  if (interval === "D") {
    return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  }
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function MarketChart({ symbol = "BTCUSDT" }: { symbol?: string }) {
  const [interval, setInterval] = useState<string>("60");
  const [data, setData] = useState<KlineResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let active = true;
    setDrawn(false);
    setFailed(false);
    const load = async () => {
      try {
        const response = await fetch(
          `/api/market/kline?symbol=${symbol}&interval=${interval}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("kline");
        const payload = (await response.json()) as KlineResponse;
        if (!active) return;
        if (!Array.isArray(payload.candles) || payload.candles.length < 2) {
          throw new Error("sin_velas");
        }
        setData(payload);
        // Un frame después para que la animación del trazo arranque desde 0.
        requestAnimationFrame(() => active && setDrawn(true));
      } catch {
        if (active) setFailed(true);
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [symbol, interval]);

  const model = useMemo(() => {
    if (!data) return null;
    const candles = data.candles;
    const lows = candles.map((c) => c.l);
    const highs = candles.map((c) => c.h);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = max - min || 1;

    const x = (i: number) => (i / (candles.length - 1)) * W;
    const y = (value: number) => PAD_Y + (1 - (value - min) / span) * (H - PAD_Y * 2);

    const line = candles
      .map((c, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(c.c).toFixed(2)}`)
      .join(" ");
    const area = `${line} L${W} ${H} L0 ${H} Z`;

    const first = candles[0].c;
    const last = candles[candles.length - 1].c;
    const up = last >= first;

    return { candles, x, y, line, area, min, max, first, last, up };
  }, [data]);

  const onMove = useCallback(
    (clientX: number) => {
      if (!model || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      setCursor(Math.round(ratio * (model.candles.length - 1)));
    },
    [model],
  );

  if (failed) {
    return (
      <div className="mkt-chart mkt-chart-empty">
        <p>No pudimos cargar la gráfica en este momento.</p>
      </div>
    );
  }

  if (!model) {
    return <div className="mkt-chart mkt-chart-loading" aria-label="Cargando gráfica" />;
  }

  const active = cursor === null ? model.candles.length - 1 : cursor;
  const candle = model.candles[active];
  const shownPrice = candle.c;
  const delta = ((shownPrice - model.first) / model.first) * 100;
  const positive = delta >= 0;

  return (
    <div className="mkt-chart">
      <header className="mkt-head">
        <div>
          <span className="eyebrow">{symbol.replace("USDT", " / USDT")}</span>
          <strong className="mkt-price">{money(shownPrice)}</strong>
          <span className={positive ? "mkt-delta up" : "mkt-delta down"}>
            {positive ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}%
          </span>
        </div>
        <time className="mkt-time">{timeLabel(candle.t, interval)}</time>
      </header>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Precio de ${symbol}`}
        className={model.up ? "up" : "down"}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setCursor(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setCursor(null)}
      >
        <defs>
          <linearGradient id="mkt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mkt-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--mkt-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path className="mkt-area" d={model.area} fill="url(#mkt-fill)" />
        <path
          className={drawn ? "mkt-line drawn" : "mkt-line"}
          d={model.line}
          fill="none"
        />

        {cursor !== null && (
          <g className="mkt-cross">
            <line x1={model.x(active)} y1={0} x2={model.x(active)} y2={H} />
            <circle cx={model.x(active)} cy={model.y(candle.c)} r="4.5" />
          </g>
        )}
      </svg>

      <footer className="mkt-ranges" role="tablist" aria-label="Periodo">
        {RANGES.map((range) => (
          <button
            key={range.id}
            type="button"
            role="tab"
            aria-selected={interval === range.id}
            title={range.hint}
            className={interval === range.id ? "mkt-range active" : "mkt-range"}
            onClick={() => setInterval(range.id)}
          >
            {range.label}
          </button>
        ))}
        <span className="mkt-source">Bybit</span>
      </footer>
    </div>
  );
}
