"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Wordmark } from "@/components/brand/logo";
import { OperationBar } from "@/components/design/operation-bar";
import {
  valueWallet,
  type BalanceItem,
  type MarketSnapshot,
  type WalletSnapshot,
} from "@/lib/wallet/portfolio-valuation";

type LoadState = "loading" | "ready" | "no-session" | "no-wallet" | "error";
const baseAssets = ["USDC", "USDT", "cbBTC", "ETH"] as const;

const fmt = (value: number, decimals = 2) =>
  new Intl.NumberFormat("es-MX", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

function formatUsdc(value: number) {
  return fmt(value, value > 0 && value < 0.01 ? 6 : 2);
}

function formatBtc(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 8 }).format(value);
}

function formatAssetAmount(token: string, amount?: string) {
  if (amount === undefined || amount === "" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(amount)) return "—";
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  const decimals = token === "BTC" || token === "cbBTC" ? 8 : token === "ETH" ? 8 : 6;
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: decimals }).format(value);
}

/** Resumen y detalle comparten UNA lectura on-chain para evitar saldos contradictorios. */
export function WalletPortfolio() {
  const [hidden, setHidden] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [market, setMarket] = useState<MarketSnapshot>(null);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      // Precios y saldos se obtienen por separado: la ausencia de precio NO
      // debe ocultar los saldos reales individuales de blockchain.
      const [balanceCall, marketCall] = await Promise.allSettled([
        fetch("/api/chain/balance", { cache: "no-store" }),
        fetch("/api/market", { cache: "no-store" }),
      ]);
      if (!active) return;

      if (balanceCall.status === "rejected") {
        setWallet(null);
        setState("error");
      } else {
        try {
          if (balanceCall.value.status === 401) {
            setWallet(null);
            setState("no-session");
          } else if (!balanceCall.value.ok) {
            setWallet(null);
            setState("error");
          } else {
            const payload = (await balanceCall.value.json()) as WalletSnapshot;
            if (!active) return;
            setWallet(payload);
            setState(payload.wallet ? "ready" : "no-wallet");
          }
        } catch {
          if (active) {
            setWallet(null);
            setState("error");
          }
        }
      }

      if (marketCall.status === "fulfilled" && marketCall.value.ok) {
        try {
          const data = (await marketCall.value.json()) as Exclude<MarketSnapshot, null>;
          const age = data.asOf ? Date.now() - Date.parse(data.asOf) : Number.NaN;
          const validAge = Number.isFinite(age) && age >= -60_000 && age <= 180_000;
          if (active) setMarket(validAge && Array.isArray(data.quotes) ? data : null);
        } catch {
          if (active) setMarket(null);
        }
      } else if (active) {
        setMarket(null);
      }
    };

    void refresh();
    const onReady = () => { void refresh(); };
    window.addEventListener("vandefi:wallet-ready", onReady);
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("vandefi:wallet-ready", onReady);
    };
  }, []);

  const valuation = state === "ready" && wallet ? valueWallet(wallet, market) : null;
  const available = valuation?.totalUsdc !== null && valuation?.totalUsdc !== undefined;
  const hasMissing = Boolean(valuation?.missingBalances.length || valuation?.missingPrices.length);
  const pendingBtc = Number(wallet?.bitcoin?.pending ?? "0");
  const statusMessage =
    state === "loading" ? "Consultando tus saldos…"
    : state === "no-session" ? "Inicia sesión para ver tu saldo."
    : state === "no-wallet" ? "Estamos preparando automáticamente tu wallet."
    : state === "error" ? "No pudimos consultar tu wallet. Vuelve a intentarlo."
    : hasMissing ? "Falta información de una red o cotización. No mostramos un total incompleto."
    : valuation?.estimatedStablecoinPeg ? "Valor aproximado: USDC y USDT se estiman próximos a 1 USD."
    : "Valor aproximado según cotizaciones de mercado.";

  const renderAssetRow = (token: string, network: string, entry?: BalanceItem) => {
    const valid = entry && !entry.error && formatAssetAmount(token, entry.amount) !== "—";
    return (
      <div className="vd-breakdown-row" key={token}>
        <span className="vd-token-mark" aria-hidden="true">{token === "BTC" ? "₿" : token === "ETH" ? "Ξ" : "$"}</span>
        <div className="vd-breakdown-name">
          <strong>{token}</strong>
          <small>{network}</small>
        </div>
        <div className="vd-breakdown-amount">
          <strong>{hidden ? "••••" : valid ? formatAssetAmount(token, entry?.amount) : "—"}</strong>
          {token === "BTC" && !hidden && valid && Number.isFinite(pendingBtc) && pendingBtc > 0 && (
            <small>+{formatBtc(pendingBtc)} pendiente</small>
          )}
          {!valid && <small>Sin lectura</small>}
        </div>
      </div>
    );
  };

  return (
    <>
      <section className="vd-total-card" aria-label="Saldo total aproximado de VanDeFi">
        <div className="vd-total-top">
          <Wordmark size={19}/>
          <button
            type="button"
            className="vd-total-eye"
            aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
            aria-pressed={hidden}
            onClick={() => setHidden((old) => !old)}
          >
            <Icon name="eye" size={19}/>
          </button>
        </div>
        <div className="vd-total-body">
          <p className="vd-total-label">VALOR TOTAL · EQUIVALENTE EN USDC</p>
          <div className="vd-total-figure" aria-live="polite">
            <strong>{hidden ? "••••" : available ? formatUsdc(valuation!.totalUsdc!) : "—"}</strong>
            <span>USDC</span>
          </div>
          {available && (
            <div className="vd-total-equivalents">
              <span>{hidden ? "≈ •••• USD" : `≈ ${fmt(valuation!.totalUsd!)} USD`}</span>
              {valuation!.totalBtc !== null && (
                <span>{hidden ? "≈ •••• BTC" : `≈ ${formatBtc(valuation!.totalBtc)} BTC`}</span>
              )}
            </div>
          )}
        </div>
        <div className="vd-total-footer">
          <p role={state === "error" || hasMissing ? "status" : undefined}>{statusMessage}</p>
          <span className="vd-total-stamp" aria-hidden="true">VANDEFI · WALLET</span>
        </div>
        {(state === "no-session" || state === "no-wallet") && (
          <Link className="vd-portfolio-gate" href={state === "no-session" ? "/login" : "/profile"}>
            {state === "no-session" ? "Entrar a mi cuenta" : "Ver estado de mi wallet"} <Icon name="chevron" size={15}/>
          </Link>
        )}
        {valuation?.estimatedCbbtcPeg && !hidden && (
          <p className="vd-cbbtc-note">cbBTC valorado aproximadamente con el precio de BTC.</p>
        )}
      </section>

      <OperationBar />

      <section className="vd-assets vd-breakdown" aria-label="Desglose de activos">
        <div className="vd-breakdown-top">
          <div>
            <p className="vd-overline">TU PORTAFOLIO</p>
            <h2>Mis activos</h2>
          </div>
          <Link href="/activity" className="vd-minor-link">Ver movimientos <Icon name="chevron" size={15}/></Link>
        </div>
        {state === "loading" ? (
          <div className="bal-skeleton" aria-label="Cargando activos"/>
        ) : state !== "ready" ? (
          <p className="bal-note">{statusMessage}</p>
        ) : (
          <div className="vd-breakdown-list">
            {baseAssets.map((token) =>
              renderAssetRow(token, "Base", wallet?.base?.balances?.find((item) => item.token === token))
            )}
            {renderAssetRow("BTC", "Bitcoin", wallet?.bitcoin)}
          </div>
        )}
      </section>
    </>
  );
}
