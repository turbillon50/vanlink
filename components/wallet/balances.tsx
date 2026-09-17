"use client";

/**
 * components/wallet/balances.tsx
 * Saldo real de la wallet: USDC/USDT/cbBTC en Base + BTC nativo.
 *
 * Reglas: nunca inventa un cero. Si una cadena no se pudo leer, lo dice.
 * El valor entra con una transición suave para que no golpee al montar.
 */

import { useEffect, useState } from "react";

type TokenBalance = { token: string; amount: string; error?: string };
type BitcoinBalance = { token: string; amount: string; pending: string; error?: string };
type BalanceResponse = {
  wallet: { evmAddress: string; bitcoinAddress: string } | null;
  base?: { network: string; balances: TokenBalance[] };
  bitcoin?: BitcoinBalance;
};

function pretty(amount: string, max = 6) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: max }).format(value);
}

export function WalletBalances({ hidden = false }: { hidden?: boolean }) {
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [state, setState] = useState<"cargando" | "listo" | "error" | "sin-wallet">("cargando");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/chain/balance", { cache: "no-store" });
        if (response.status === 401) { if (active) setState("sin-wallet"); return; }
        if (!response.ok) throw new Error("balance");
        const payload = (await response.json()) as BalanceResponse;
        if (!active) return;
        setData(payload);
        setState(payload.wallet ? "listo" : "sin-wallet");
      } catch {
        if (active) setState("error");
      }
    };
    void load();
    const timer = window.setInterval(load, 45_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (state === "sin-wallet") {
    return <p className="bal-note">Activa tu wallet para ver tus activos y movimientos.</p>;
  }
  if (state === "error") {
    return <p className="bal-note">No pudimos leer tus saldos ahora. Lo reintentamos solo.</p>;
  }
  if (state === "cargando" || !data) {
    return <div className="bal-skeleton" aria-label="Cargando saldos" />;
  }

  const base = (data.base?.balances ?? []).filter(b => !b.error);
  const btc = data.bitcoin && !data.bitcoin.error ? data.bitcoin : null;
  const pendiente = btc && Number(btc.pending) > 0;

  return (
    <div className="bal-list">
      {base.map((b) => (
        <div className="bal-row" key={b.token}>
          <span className="bal-token">{b.token}<em>Base</em></span>
          <span className="bal-amount">{hidden ? "••••" : pretty(b.amount)}</span>
        </div>
      ))}
      {btc && (
        <div className="bal-row" key="btc-nativo">
          <span className="bal-token">BTC<em>Bitcoin</em></span>
          <span className="bal-amount">
            {hidden ? "••••" : pretty(btc.amount, 8)}
            {pendiente && !hidden && (
              <small className="bal-pending" title="Depósito visto en mempool, aún sin confirmar">
                +{pretty(btc.pending, 8)} en camino
              </small>
            )}
          </span>
        </div>
      )}
      {base.length === 0 && !btc && (
        <p className="bal-note">No pudimos leer ninguna red en este momento.</p>
      )}
    </div>
  );
}
