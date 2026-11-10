"use client";

import Link from "next/link";
import { usePolygonAvailability } from "@/lib/polygon/use-availability";
import type { PolygonAvailability } from "@/lib/polygon/availability";
import { PolygonAvailabilityNotice } from "@/components/wallet/polygon-availability";
import { useEffect, useRef, useState } from "react";
import { keccak256 } from "viem";
import { OperationMonitor } from "@/components/wallet/operation-monitor";
import { trackOperation, reconcileOperation, phaseLabel, type TrackedPhase } from "@/lib/operations/tracker";
import { useAuth } from "@clerk/nextjs";
import { PressButton } from "@/components/ui/press-button";
import { RecoverDevice } from "@/components/wallet/recover-device";
import {
  buildPolygonUSDTUnsigned, formatPolygonUSDT, maxPolygonGas,
  normalizePolygonAddress, polygonUSDTUnits, verifyPolygonUSDTSigned,
  type PolygonTransferQuote,
} from "@/lib/send/polygon-tx";

type Wallet = { organizationId: string; turnkeyUserId: string; evmAddress: string };
type Phase = "loading" | "guest" | "no-wallet" | "ready" | "error";
type Quote = { from: string; to: string; value: string; quote: PolygonTransferQuote; expiryMs: number };
type Sent = { hash: string; explorer: string; state: "pending" | "confirmed" | "failed"; phase: TrackedPhase; uncertain?: boolean };

class RequestError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function formatPOL(value: bigint) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 7 }).format(Number(value) / 1e18);
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw new RequestError(response.status, data.error || "error_red", data.message || data.error || "No pudimos completar la operación.");
  return data as T;
}

export function SendPolygonUSDT() {
  const availability = usePolygonAvailability();
  if (availability !== "enabled") return <div className="form-stack">
    <PolygonAvailabilityNotice availability={availability} />
    <p className="vd-legal-note">Tus activos históricos de Base y Bitcoin siguen disponibles en Experto.</p>
    <PressButton href="/expert" variant="secondary">Abrir herramientas expertas</PressButton>
  </div>;
  return <SendPolygonUSDTSession />;
}

function SendPolygonUSDTSession() {
  const { userId, isLoaded } = useAuth();
  return <SendPolygonUSDTForUser key={isLoaded ? userId || "guest" : "loading"}/>;
}

function SendPolygonUSDTForUser() {
  const { isLoaded, userId } = useAuth();
  const [phase, setPhase] = useState<Phase>("loading");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [deviceOk, setDeviceOk] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [moneyAvailability, setMoneyAvailability] = useState<PolygonAvailability>("loading");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [walletVersion, setWalletVersion] = useState(0);
  const [trackingSaved, setTrackingSaved] = useState(true);
  const inFlight = useRef(false);
  const sessionUserId = useRef(userId);

  useEffect(() => {
    sessionUserId.current = userId;
    setSent(null); setQuote(null); setError(""); setTrackingSaved(true);
  }, [userId]);

  useEffect(() => {
    const onWallet = () => setWalletVersion(v => v + 1);
    window.addEventListener("vandefi:wallet-ready", onWallet);
    return () => window.removeEventListener("vandefi:wallet-ready", onWallet);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) { setPhase("guest"); setWallet(null); setSent(null); setQuote(null); return; }
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
          request<{ polygon: { amount: string }; sendEnabled: boolean }>("/api/chain/polygon").catch(() => null),
        ]);
        const verified = await verifyWalletDevice(userId, found.organizationId, found.turnkeyUserId).catch(() => false);
        if (live) { setDeviceOk(verified); setBalance(polygon?.polygon.amount ?? null); setMoneyAvailability(polygon ? polygon.sendEnabled === true ? "enabled" : "paused" : "unknown"); }
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => { live = false; };
  }, [isLoaded, userId, walletVersion]);

  useEffect(() => {
    if (!sent || sent.state !== "pending" || !userId) return;
    let live = true;
    const refresh = async () => {
      try {
        const query = new URLSearchParams({ network: "polygon", id: sent.hash });
        const status = await request<{
          confirmed: boolean; failed: boolean; phase?: TrackedPhase;
          confirmations?: number | null; checkedAt?: string;
        }>("/api/send/status?" + query.toString());
        if (!live) return;
        const nextPhase = status.phase ?? (status.failed ? "failed" : status.confirmed ? "confirmed" : "pending");
        reconcileOperation(userId, sent.hash, "polygon", {
          phase: nextPhase, confirmations: status.confirmations ?? null,
          checkedAt: status.checkedAt || new Date().toISOString(),
        });
        setSent(previous => previous ? {
          ...previous, phase: nextPhase,
          state: status.failed ? "failed" : status.confirmed ? "confirmed" : "pending",
          uncertain: nextPhase === "not_seen" || nextPhase === "unavailable",
        } : previous);
      } catch { /* Keep the exact hash; a failed status lookup cannot prove failure. */ }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 7_000);
    return () => { live = false; clearInterval(timer); };
  }, [sent?.hash, sent?.state, userId]);

  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || busy) return;
    setError("");
    const to = normalizePolygonAddress(destination);
    const value = polygonUSDTUnits(amount);
    if (!to) { setError("Revisa la dirección. Sólo se admite una dirección válida de Polygon (0x…)."); return; }
    if (to.toLowerCase() === wallet.evmAddress.toLowerCase()) { setError("No puedes enviarte a ti mismo."); return; }
    if (!value) { setError("Escribe un monto válido de USDT, con hasta seis decimales."); return; }
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
    if (!wallet || !quote || !userId || inFlight.current || deviceOk !== true) return;
    if (Date.now() >= quote.expiryMs) { setQuote(null); setError("La cotización venció. Revisa el importe nuevamente."); return; }
    inFlight.current = true;
    setError(""); setBusy(true);
    let candidate: Sent | null = null;
    let networkAttempted = false;
    try {
      const { unsigned } = buildPolygonUSDTUnsigned({
        to: quote.to, amount: BigInt(quote.value), quote: quote.quote,
      });
      const { signEvmTransaction } = await import("@/lib/send/signer");
      const signature = await signEvmTransaction(wallet.organizationId, wallet.evmAddress, unsigned);
      const verified = await verifyPolygonUSDTSigned(signature, { from: wallet.evmAddress, unsigned });
      if (sessionUserId.current !== userId) throw new Error("La sesión cambió. Revisa tu cuenta antes de enviar.");
      const hash = keccak256(verified);
      candidate = { hash, explorer: "https://polygonscan.com/tx/" + hash, state: "pending", phase: "submitted" };
      setTrackingSaved(trackOperation(userId, {
        network: "polygon", id: hash, label: formatPolygonUSDT(BigInt(quote.value)) + " USDT", direction: "out",
      }));
      networkAttempted = true;
      const result = await request<{ hash: string; broadcastUncertain?: boolean }>("/api/send/polygon/broadcast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed: verified }),
      });
      if (sessionUserId.current !== userId) return;
      if (result.hash.toLowerCase() !== hash.toLowerCase()) throw new Error("El hash devuelto no coincide con lo firmado.");
      setSent({ ...candidate, uncertain: result.broadcastUncertain === true, phase: result.broadcastUncertain ? "not_seen" : "pending" });
      setQuote(null);
    } catch (e) {
      if (sessionUserId.current !== userId) return;
      const rejectedBeforeBroadcast = e instanceof RequestError && (e.status < 500 || e.code === "historial_no_disponible" || e.code === "polygon_no_habilitado");
      if (networkAttempted && candidate && !rejectedBeforeBroadcast) {
        // A timeout may follow a successful broadcast. Keep this same hash and do not invite a duplicate payment.
        setSent({ ...candidate, uncertain: true, phase: "unavailable" });
        setQuote(null);
      } else {
        if (candidate) reconcileOperation(userId, candidate.hash, "polygon", {
          phase: "not_seen", confirmations: null, checkedAt: new Date().toISOString(),
        });
        setError((e as Error).message || "No pudimos firmar o transmitir la operación.");
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  if (phase === "loading") return <div className="snd-skeleton" aria-label="Cargando wallet"/>;
  if (phase === "guest") return <div className="snd-gate">
    <p>Inicia sesión para consultar tu wallet y la disponibilidad de USDT.</p>
    <PressButton href="/login?redirect_url=/send">Entrar a mi cuenta</PressButton>
  </div>;
  if (phase === "no-wallet") return <div className="snd-gate">
    <p>Tu cuenta todavía no tiene una wallet. Consulta su estado en Cuenta.</p>
    <PressButton href="/profile">Ver mi cuenta</PressButton>
  </div>;
  if (phase === "error" || !wallet) return <p className="field-error">No pudimos consultar tu wallet.</p>;
  if (moneyAvailability !== "enabled") return <PolygonAvailabilityNotice availability={moneyAvailability} />;

  if (sent) return (
    <div className="form-stack">
      <div className="snd-done">
        <h2>{sent.state === "confirmed" ? "Transferencia confirmada" : sent.state === "failed" ? "Transferencia fallida" : phaseLabel(sent.phase)}</h2>
        <p>{sent.state === "pending" ? sent.uncertain ? "La recepción aún no está verificada. Comprueba este mismo hash antes de intentar otro envío." : "Esperando la confirmación de Polygon." : sent.state === "failed" ? "La red rechazó la ejecución y pudo cobrar gas." : "Polygon confirmó la transferencia de USDT. Si el destino es un exchange, su acreditación puede tardar más."}</p>
        <code className="snd-txid">{sent.hash.slice(0, 18)}…{sent.hash.slice(-8)}</code>
      </div>
      <PressButton href={sent.explorer} target="_blank" rel="noopener noreferrer">Ver en Polygonscan</PressButton>
      {!trackingSaved && <p role="alert" className="field-error">Este navegador no pudo guardar el seguimiento. Conserva el hash para consultar este envío.</p>}
      {sent.state !== "pending" && <PressButton variant="secondary" onClick={() => { setSent(null); setDestination(""); setAmount(""); setError(""); }}>Nuevo envío</PressButton>}
      <OperationMonitor compact/>
    </div>
  );

  if (quote) return (
    <div className="form-stack">
      <div className="snd-hero"><span>Vas a enviar</span><strong>{formatPolygonUSDT(BigInt(quote.value))} USDT</strong><small>Polygon PoS · comisión en POL</small></div>
      <div className="summary-panel">
        <p><strong>Destino:</strong> <code className="snd-addr">{quote.to}</code></p>
        <p><strong>Red:</strong> Polygon PoS · 137</p>
        <p><strong>Comisión máxima estimada:</strong> {formatPOL(maxPolygonGas(quote.quote))} POL</p>
        <p><strong>Contrato:</strong> USDT de Tether</p>
      </div>
      <p className="rcv-warn">Verifica dirección, red y costo. Las transacciones confirmadas no se pueden revertir.</p>
      {deviceOk === false && userId && <RecoverDevice userId={userId} context="firmar envíos" onRecovered={() => setDeviceOk(true)} />}
      {deviceOk === null && <p role="status">Comprobando autorización de este dispositivo…</p>}
      {error && <p role="alert" className="field-error">{error}</p>}
      <PressButton onClick={() => { void confirm(); }} disabled={busy || deviceOk !== true}>
        {busy ? "Firmando y enviando…" : "Confirmar y enviar"}
      </PressButton>
      <PressButton variant="secondary" onClick={() => { setQuote(null); setError(""); }} disabled={busy}>Editar</PressButton>
      <OperationMonitor compact/>
    </div>
  );

  return <div className="form-stack"><form className="form-stack" onSubmit={review} noValidate>
    <div className="vd-polygon-line"><strong>USDT</strong><span>Polygon PoS</span></div>
    <label className="field-label">Dirección de destino
      <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="0x…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"/>
    </label>
    <label className="amount-field"><span>Monto en USDT</span>
      <div><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
        placeholder="0.00"/><strong className="currency-label">USDT</strong></div>
    </label>
    <p className="vd-legal-note">Disponible: {balance === null ? "—" : balance + " USDT"} · Se requiere POL para el gas.</p>
    {error && <p role="alert" className="field-error">{error}</p>}
    <PressButton type="submit" disabled={busy || !wallet}>{busy ? "Cotizando…" : "Revisar envío"}</PressButton>
    <Link className="snd-link" href="/receive">¿Quieres recibir USDT? Abre tu QR de Polygon.</Link>
  </form><OperationMonitor compact/></div>;
}
