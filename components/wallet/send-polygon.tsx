"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { PressButton } from "@/components/ui/press-button";
import { RecoverDevice } from "@/components/wallet/recover-device";
import {
  buildPolygonUSDCUnsigned, formatPolygonUSDC, maxPolygonGas,
  normalizePolygonAddress, polygonUSDCUnits, verifyPolygonUSDCSigned,
  type PolygonTransferQuote,
} from "@/lib/send/polygon-tx";

type Wallet = { organizationId: string; turnkeyUserId: string; evmAddress: string };
type Phase = "loading" | "guest" | "no-wallet" | "ready" | "error";
type Quote = { from: string; to: string; value: string; quote: PolygonTransferQuote; expiryMs: number };
type Sent = { hash: string; explorer: string; state: "pending" | "confirmed" | "failed" };

function formatPOL(value: bigint) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 7 }).format(Number(value) / 1e18);
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw new Error(data.message || data.error || "No pudimos completar la operación.");
  return data as T;
}

export function SendPolygonUSDC() {
  const { isLoaded, userId } = useAuth();
  const [phase, setPhase] = useState<Phase>("loading");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [deviceOk, setDeviceOk] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [walletVersion, setWalletVersion] = useState(0);

  useEffect(() => {
    const onWallet = () => setWalletVersion(v => v + 1);
    window.addEventListener("vandefi:wallet-ready", onWallet);
    return () => window.removeEventListener("vandefi:wallet-ready", onWallet);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) { setPhase("guest"); setWallet(null); return; }
    let live = true;
    void (async () => {
      try {
        const { wallet: found } = await request<{ wallet: Wallet | null }>("/api/wallet");
        if (!live) return;
        if (!found) { setPhase("no-wallet"); return; }
        setWallet(found);
        setPhase("ready");
        const [{ verifyWalletDevice }, polygon] = await Promise.all([
          import("@/lib/wallet/browser"),
          request<{ polygon: { amount: string } }>("/api/chain/polygon").catch(() => null),
        ]);
        const verified = await verifyWalletDevice(userId, found.organizationId, found.turnkeyUserId).catch(() => false);
        if (live) { setDeviceOk(verified); setBalance(polygon?.polygon.amount ?? null); }
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => { live = false; };
  }, [isLoaded, userId, walletVersion]);

  useEffect(() => {
    if (!sent || sent.state !== "pending") return;
    let live = true;
    const refresh = async () => {
      try {
        const query = new URLSearchParams({ network: "polygon", id: sent.hash });
        const status = await request<{ confirmed: boolean; failed: boolean }>("/api/send/status?" + query.toString());
        if (!live) return;
        if (status.failed) setSent(prev => prev ? { ...prev, state: "failed" } : prev);
        else if (status.confirmed) setSent(prev => prev ? { ...prev, state: "confirmed" } : prev);
      } catch { /* not confirmed; retry */ }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 7_000);
    return () => { live = false; clearInterval(timer); };
  }, [sent]);

  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || busy) return;
    setError("");
    const to = normalizePolygonAddress(destination);
    const value = polygonUSDCUnits(amount);
    if (!to) { setError("Revisa la dirección. Sólo se admite una dirección válida de Polygon (0x…)."); return; }
    if (to.toLowerCase() === wallet.evmAddress.toLowerCase()) { setError("No puedes enviarte a ti mismo."); return; }
    if (!value) { setError("Escribe un monto válido de USDC, con hasta seis decimales."); return; }
    setBusy(true);
    try {
      const query = new URLSearchParams({ to, value: value.toString() });
      const result = await request<Quote>("/api/send/polygon/prepare?" + query.toString());
      if (result.from.toLowerCase() !== wallet.evmAddress.toLowerCase() || result.to.toLowerCase() !== to.toLowerCase() ||
          result.value !== value.toString()) throw new Error("La cotización no coincide con el envío.");
      setQuote(result);
    } catch (e) { setError((e as Error).message || "No pudimos cotizar la red."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!wallet || !quote || busy || deviceOk !== true) return;
    if (Date.now() >= quote.expiryMs) { setQuote(null); setError("La cotización venció. Revisa el importe nuevamente."); return; }
    setError(""); setBusy(true);
    try {
      const { unsigned } = buildPolygonUSDCUnsigned({
        to: quote.to, amount: BigInt(quote.value), quote: quote.quote,
      });
      const { signEvmTransaction } = await import("@/lib/send/signer");
      const signature = await signEvmTransaction(wallet.organizationId, wallet.evmAddress, unsigned);
      const verified = await verifyPolygonUSDCSigned(signature, { from: wallet.evmAddress, unsigned });
      const result = await request<{ hash: string; explorer: string }>("/api/send/polygon/broadcast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed: verified }),
      });
      setSent({ ...result, state: "pending" });
      setQuote(null);
    } catch (e) { setError((e as Error).message || "No pudimos firmar o transmitir la operación."); }
    finally { setBusy(false); }
  }

  if (phase === "loading") return <div className="snd-skeleton" aria-label="Cargando wallet"/>;
  if (phase === "guest") return <div className="snd-gate">
    <p>Tu wallet se crea al registrarte. Entra para enviar USDC.</p>
    <PressButton href="/login?redirect_url=/send">Entrar a mi cuenta</PressButton>
  </div>;
  if (phase === "no-wallet") return <div className="snd-gate">
    <p>Estamos generando tu wallet automáticamente.</p>
    <PressButton href="/profile">Ver mi cuenta</PressButton>
  </div>;
  if (phase === "error" || !wallet) return <p className="field-error">No pudimos consultar tu wallet.</p>;

  if (sent) return (
    <div className="form-stack">
      <div className="snd-done">
        <h2>{sent.state === "confirmed" ? "Transferencia confirmada" : sent.state === "failed" ? "Transferencia fallida" : "Enviada a Polygon"}</h2>
        <p>{sent.state === "pending" ? "Esperando la confirmación de la red." : sent.state === "failed" ? "La red rechazó la ejecución y pudo cobrar gas." : "El USDC llegó a la red de destino."}</p>
        <code className="snd-txid">{sent.hash.slice(0, 18)}…{sent.hash.slice(-8)}</code>
      </div>
      <PressButton href={sent.explorer} target="_blank" rel="noopener noreferrer">Ver en Polygonscan</PressButton>
      <PressButton variant="secondary" onClick={() => { setSent(null); setDestination(""); setAmount(""); }}>Nuevo envío</PressButton>
    </div>
  );

  if (quote) return (
    <div className="form-stack">
      <div className="snd-hero"><span>Vas a enviar</span><strong>{formatPolygonUSDC(BigInt(quote.value))} USDC</strong><small>Polygon PoS · comisión en POL</small></div>
      <div className="summary-panel">
        <p><strong>Destino:</strong> <code className="snd-addr">{quote.to}</code></p>
        <p><strong>Red:</strong> Polygon PoS · 137</p>
        <p><strong>Comisión máxima estimada:</strong> {formatPOL(maxPolygonGas(quote.quote))} POL</p>
        <p><strong>Contrato:</strong> USDC nativo de Circle</p>
      </div>
      <p className="rcv-warn">Verifica dirección, red y costo. Las transacciones confirmadas no se pueden revertir.</p>
      {deviceOk === false && userId && <RecoverDevice userId={userId} context="firmar envíos" onRecovered={() => setDeviceOk(true)} />}
      {deviceOk === null && <p role="status">Comprobando autorización de este dispositivo…</p>}
      {error && <p role="alert" className="field-error">{error}</p>}
      <PressButton onClick={() => { void confirm(); }} disabled={busy || deviceOk !== true}>
        {busy ? "Firmando y enviando…" : "Confirmar y enviar"}
      </PressButton>
      <PressButton variant="secondary" onClick={() => { setQuote(null); setError(""); }} disabled={busy}>Editar</PressButton>
    </div>
  );

  return <form className="form-stack" onSubmit={review} noValidate>
    <div className="vd-polygon-line"><strong>USDC</strong><span>Polygon PoS</span></div>
    <label className="field-label">Dirección de destino
      <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="0x…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"/>
    </label>
    <label className="amount-field"><span>Monto en USDC</span>
      <div><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
        placeholder="0.00"/><strong className="currency-label">USDC</strong></div>
    </label>
    <p className="vd-legal-note">Disponible: {balance === null ? "—" : balance + " USDC"} · Se requiere POL para el gas.</p>
    {error && <p role="alert" className="field-error">{error}</p>}
    <PressButton type="submit" disabled={busy || !wallet}>{busy ? "Cotizando…" : "Revisar envío"}</PressButton>
    <Link className="snd-link" href="/receive">¿Quieres recibir USDC? Abre tu QR de Polygon.</Link>
  </form>;
}
