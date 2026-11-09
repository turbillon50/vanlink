"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";
import { useWalletMode } from "@/components/mode/wallet-mode";
import { authConfigured } from "@/lib/auth-config";

type TrackedToken = {
  contract: string; symbol: string; balance: string;
  network: string; source: string; decimals: number; verified: false;
};
const MAX_TOKENS = 20;
const STORAGE_PREFIX = "vandefi.expert.polygon.tokens.v1.";

function safeContract(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

function Playground() {
  const { user, isLoaded } = useUser();
  const { mode, setMode } = useWalletMode();
  const [input, setInput] = useState("");
  const [tokens, setTokens] = useState<TrackedToken[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const userId = user?.id;
  const storageKey = userId ? STORAGE_PREFIX + userId : "";

  async function inspect(contract: string): Promise<TrackedToken> {
    const url = "/api/expert/token?contract=" + encodeURIComponent(contract);
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as TrackedToken & { error?: string };
    if (!response.ok || !data.contract || data.network !== "Polygon") throw new Error(data.error || "No se pudo leer ese token.");
    return data;
  }

  useEffect(() => {
    if (!storageKey) { setTokens([]); return; }
    let live = true;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]") as unknown;
      const list = Array.isArray(stored) ? stored.filter(x => typeof x === "string" && safeContract(x)).slice(0, MAX_TOKENS) as string[] : [];
      setTokens([]);
      if (list.length) void Promise.all(list.map(contract => inspect(contract).catch(() => null))).then(result => {
        if (live) setTokens(result.filter((v): v is TrackedToken => v !== null));
      });
    } catch { setTokens([]); }
    return () => { live = false; };
  }, [storageKey]);

  function save(next: TrackedToken[]) {
    setTokens(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(next.map(item => item.contract))); } catch { /* read-only fallback */ }
    }
  }

  async function addToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const contract = input.trim();
    if (!safeContract(contract)) { setError("Escribe la dirección 0x… del contrato ERC-20 en Polygon."); return; }
    if (tokens.length >= MAX_TOKENS) { setError("El playground admite hasta 20 tokens por dispositivo."); return; }
    if (tokens.some(t => t.contract.toLowerCase() === contract.toLowerCase())) { setError("Ya agregaste ese contrato."); return; }
    setBusy(true);
    try {
      const found = await inspect(contract);
      save([...tokens, found]);
      setInput("");
    } catch (cause) { setError((cause as Error).message || "No pudimos leer el contrato."); }
    finally { setBusy(false); }
  }

  return (
    <AppShell wide>
      <TopBar title="Playground" backHref="/operate"/>
      <div className="vd-playground">
        <header className="vd-playground-header">
          <p className="vd-overline">TU ESPACIO CONFIGURABLE</p>
          <h1>Tu wallet. Tus herramientas.</h1>
          <p>Agrega los tokens ERC-20 que quieras observar en Polygon, sin mezclar sus saldos con tu cuenta USDT principal.</p>
        </header>
        {mode === "simple" ? (
          <section className="vd-expert-gate">
            <strong>Activa Experto para personalizar.</strong>
            <p>Tu saldo USDC seguirá exactamente igual; solamente aparecen herramientas adicionales.</p>
            <button type="button" onClick={() => setMode("expert")}>Activar modo Experto</button>
          </section>
        ) : (
          <>
            <section className="vd-playground-widget">
              <div className="vd-playground-widget-head">
                <div><p className="vd-overline">MÓDULO 01</p><h2>Mis tokens en Polygon</h2></div>
                <span>{tokens.length}/{MAX_TOKENS}</span>
              </div>
              <form onSubmit={addToken} className="vd-playground-form">
                <label htmlFor="vd-token-contract">Contrato del token ERC-20</label>
                <div>
                  <input id="vd-token-contract" value={input} onChange={e => setInput(e.target.value)}
                    placeholder="0x…" spellCheck={false} autoCorrect="off" autoCapitalize="none"/>
                  <button type="submit" disabled={busy || !userId}><Icon name="plus" size={18}/> Añadir</button>
                </div>
                {error && <p role="alert" className="field-error">{error}</p>}
              </form>
              {!isLoaded || !userId
                ? <p className="vd-legal-note">Inicia sesión para consultar tus activos.</p>
                : tokens.length === 0
                  ? <p className="vd-playground-empty">Tu lista está vacía. Agrega un contrato para consultar el saldo real de tu dirección Turnkey.</p>
                  : <div className="vd-playground-tokens">{tokens.map(token => (
                    <div className="vd-playground-token" key={token.contract}>
                      <span><strong>{token.symbol}</strong><small>{token.contract.slice(0, 8)}…{token.contract.slice(-6)} · No verificado</small></span>
                      <span><strong>{token.balance}</strong><small>Polygon</small></span>
                      <button type="button" aria-label={"Quitar " + token.symbol} onClick={() => save(tokens.filter(x => x.contract !== token.contract))}>
                        <Icon name="close" size={16}/>
                      </button>
                    </div>
                  ))}</div>
              }
              <p className="vd-legal-note">Lectura de balances únicamente. Los símbolos pueden ser falsificados por cualquier contrato. Nunca pegues frases semilla, claves ni credenciales.</p>
            </section>
            <section className="vd-playground-widget">
              <div className="vd-playground-widget-head"><div><p className="vd-overline">MÓDULO 02</p><h2>Herramientas adicionales</h2></div></div>
              <div className="vd-utility-list">
                <Link className="vd-utility-row" href="/market"><span className="vd-utility-icon"><Icon name="chart" size={20}/></span>
                  <span><strong>Mercado</strong><small>Cotizaciones y evolución de activos</small></span><Icon name="chevron" size={16}/></Link>
                <Link className="vd-utility-row" href="/receive"><span className="vd-utility-icon"><Icon name="wallet" size={20}/></span>
                  <span><strong>Mis redes y direcciones</strong><small>Polygon + acceso a Base y BTC históricos</small></span><Icon name="chevron" size={16}/></Link>
              </div>
            </section>
            <p className="vd-legal-note">Alchemy proporciona APIs para datos enriquecidos de tokens; si todavía no hay una clave de Alchemy conectada, VanDeFi usa un RPC público de sólo lectura. Agregar un token aquí no habilita transferencias de ese token.</p>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function ExpertPage() {
  if (!authConfigured) return <AppShell><TopBar title="Playground"/><p>Conecta el acceso de VanDeFi para usar el playground.</p></AppShell>;
  return <Playground/>;
}
