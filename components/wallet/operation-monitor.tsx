"use client";

import { useAuth } from "@clerk/nextjs";
import { authConfigured } from "@/lib/auth-config";
import { useEffect, useRef, useState } from "react";
import {
  TRACKING_EVENT, decodeOperations, explorerForOperation, isValidTransactionId,
  phaseLabel, readTrackedOperations, reconcileOperation, trackOperation,
  type TrackedOperation, type TrackedPhase,
} from "@/lib/operations/tracker";
import { Icon } from "@/components/icons";

type StatusPayload = {
  phase?: TrackedPhase;
  failed?: boolean;
  confirmed?: boolean;
  confirmations?: number | null;
  checkedAt?: string;
  canonical?:boolean|null;
  reorg?:boolean;
  transfers?: Array<{ token: string; amount: string; direction: "in" | "out" }>;
};

async function fetchStatus(item: Pick<TrackedOperation, "network" | "id">): Promise<StatusPayload> {
  const params = new URLSearchParams({ network: item.network, id: item.id });
  const response = await fetch("/api/send/status?" + params, { cache: "no-store" });
  if (!response.ok) throw new Error("La red todavía no pudo confirmar esa operación.");
  return response.json() as Promise<StatusPayload>;
}

function formatTime(value: string | null): string {
  if (!value) return "Por comprobar";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Por comprobar";
  return parsed.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function OperationMonitorInner({ compact = false }: { compact?: boolean }) {
  const { userId, isLoaded } = useAuth();
  const [operations, setOperations] = useState<TrackedOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [lookupNetwork, setLookupNetwork] = useState<"polygon" | "base">("polygon");
  const [message, setMessage] = useState("");
  const [showOlder, setShowOlder] = useState(false);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const running = useRef(false);
  const pollingCursor = useRef(0);
  const sessionUserId = useRef(userId);

  useEffect(() => {
    sessionUserId.current = userId;
    pollingCursor.current = 0;
    setMessage(""); setTxHash(""); setLoading(false); setServerUnavailable(false);
  }, [userId]);

  useEffect(() => {
    if (!isLoaded || !userId) { setOperations([]); return; }
    const refreshLocal = () => setOperations(readTrackedOperations(userId));
    refreshLocal();
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("vandefi.operation-tracker.v2.")) refreshLocal();
    };
    window.addEventListener(TRACKING_EVENT, refreshLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TRACKING_EVENT, refreshLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, [isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded || !userId) return;
    let active = true;
    let hydrating = false;
    const hydrate = async () => {
      if (!active || hydrating || document.visibilityState === "hidden") return;
      hydrating = true;
      try {
        const response = await fetch("/api/chain/activity?trackedOnly=1", { cache: "no-store" });
        if (!response.ok) { if (active) setServerUnavailable(true); return; }
        const payload = await response.json() as { trackedOperations?: unknown };
        if (!active) return;
        if (!Array.isArray(payload.trackedOperations)) { setServerUnavailable(true); return; }
        setServerUnavailable(false);
        for (const item of decodeOperations(JSON.stringify(payload.trackedOperations))) {
          if (!active) return;
          trackOperation(userId, item);
          // The server journal preserves submission hashes. An older submitted
          // entry must not undo a receipt already checked on this device.
          if (item.phase !== "submitted") reconcileOperation(userId, item.id, item.network, {
            phase: item.phase, confirmations: item.confirmations,
            checkedAt: item.checkedAt || new Date().toISOString(),
          });
        }
        setOperations(readTrackedOperations(userId));
      } catch { if (active) setServerUnavailable(true); }
      finally { hydrating = false; }
    };
    void hydrate();
    const timer = window.setInterval(() => { void hydrate(); }, 60_000);
    const visible = () => { if (document.visibilityState === "visible") void hydrate(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [isLoaded, userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const checkAll = async () => {
      if (!active || running.current || document.visibilityState === "hidden") return;
      running.current = true;
      const pending = readTrackedOperations(userId)
        .filter(item => (item.phase !== "confirmed" && item.phase !== "failed") ||
          !item.checkedAt || Date.now()-Date.parse(item.checkedAt)>300_000);
      // Rotate bounded batches so older pending hashes also get checked.
      const offset = pollingCursor.current % Math.max(pending.length, 1);
      const batch = Array.from({ length: Math.min(10, pending.length) },
        (_, index) => pending[(offset + index) % pending.length]);
      pollingCursor.current = pending.length ? (offset + batch.length) % pending.length : 0;
      try {
        await Promise.allSettled(batch.map(async item => {
          try {
            const response = await fetchStatus(item);
            if (!active) return;
            const phase = response.phase ?? (response.confirmed ? "confirmed" : response.failed ? "failed" : "pending");
            reconcileOperation(userId, item.id, item.network, {
              phase, confirmations: response.confirmations ?? null,
              checkedAt: response.checkedAt || new Date().toISOString(),
              canonical:response.canonical,reorg:response.reorg,
            });
          } catch {
            // Keep pending record; a failed RPC is never evidence of a failed tx.
          }
        }));
      } finally { running.current = false; }
    };
    void checkAll();
    const timer = window.setInterval(() => { void checkAll(); }, 15_000);
    const visible = () => { if (document.visibilityState === "visible") void checkAll(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId]);

  async function checkIncoming(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || loading) return;
    const hash = txHash.trim();
    const networkName = lookupNetwork === "polygon" ? "Polygon" : "Base";
    const token = lookupNetwork === "polygon" ? "USDT" : "USDC";
    if (!isValidTransactionId(lookupNetwork, hash)) {
      setMessage("Escribe un hash válido de " + networkName + " (0x + 64 caracteres hexadecimales).");
      return;
    }
    setMessage("");
    setLoading(true);
    try {
      const response = await fetchStatus({ network: lookupNetwork, id: hash });
      if (sessionUserId.current !== userId) return;
      if (response.phase === "not_seen") {
        setMessage("La red " + networkName + " aún no localiza ese hash. Revisa el enlace o vuelve a comprobar.");
        return;
      }
      const transfer = response.transfers?.find(item => item.direction === "in" && item.token === token);
      if (!transfer) {
        setMessage("El hash existe, pero todavía no se comprobó un ingreso de " + token + " a tu dirección.");
        return;
      }
      if (!trackOperation(userId, {
        id: hash, network: lookupNetwork, direction: "in",
        label: transfer.amount + " " + token,
      })) {
        setMessage("Esta PWA no pudo conservar el seguimiento. Guarda el hash del comprobante.");
        return;
      }
      reconcileOperation(userId, hash, lookupNetwork, {
        phase: response.phase ?? "confirming",
        confirmations: response.confirmations ?? null,
        checkedAt: response.checkedAt || new Date().toISOString(),
      });
      setTxHash("");
      setMessage("Ingreso " + token + " localizado. Puedes ver su estado abajo.");
    } catch {
      if (sessionUserId.current !== userId) return;
      setMessage("La red no respondió. El ingreso puede existir; no vuelvas a pedir otro envío por este error.");
    } finally { if (sessionUserId.current === userId) setLoading(false); }
  }

  if (!isLoaded || !userId) return null;
  const active = operations.filter(item => item.phase !== "confirmed" && item.phase !== "failed");
  const completed = operations.filter(item => item.phase === "confirmed" || item.phase === "failed");
  const visible = [...active, ...completed.slice(0, showOlder ? 30 : compact ? 2 : 5)];
  return (
    <section className={compact ? "vd-operations-monitor compact" : "vd-operations-monitor"}
      aria-label="Estado verificable de tus operaciones">
      <div className="vd-operations-heading">
        <div>
          <p className="vd-overline">BLOCKCHAIN · POLYGON / BASE / BITCOIN</p>
          <h2>Seguimiento de operaciones</h2>
        </div>
        {active.length > 0 && <span className="vd-operations-count">{active.length} por verificar</span>}
      </div>
      <p className="vd-operations-explainer">
        Los envíos Polygon se recuperan desde tu cuenta; este dispositivo conserva el seguimiento. La blockchain confirma su estado.
      </p>
      {!compact && (
        <form className="vd-operations-lookup" onSubmit={checkIncoming}>
          <label htmlFor="vd-operation-network">Red del depósito</label>
          <select id="vd-operation-network" value={lookupNetwork}
            onChange={event => { setLookupNetwork(event.target.value as "polygon" | "base"); setMessage(""); }} disabled={loading}>
            <option value="polygon">USDT · Polygon</option>
            <option value="base">USDC · Base (histórico)</option>
          </select>
          <label htmlFor="vd-operation-txid">Comprueba el hash de tu depósito</label>
          <div>
            <input id="vd-operation-txid" value={txHash} onChange={e => setTxHash(e.target.value.trim())}
              placeholder={lookupNetwork === "polygon" ? "0x… Hash de Polygon" : "0x… Hash de Base"} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              aria-describedby={message ? "vd-operation-feedback" : undefined}/>
            <button type="submit" disabled={loading || !txHash.trim()}>
              {loading ? "Buscando…" : "Comprobar"}
            </button>
          </div>
          {message && <p id="vd-operation-feedback" role="status">{message}</p>}
        </form>
      )}
      {serverUnavailable && <p role="status" className="vd-operations-disclaimer">No pudimos recuperar tus envíos desde el servidor. Conservamos los hashes de este dispositivo y volveremos a consultar.</p>}
      {visible.length === 0
        ? <p className="vd-no-operations">{serverUnavailable ? "Puedes comprobar un envío con su hash mientras se restablece el historial." : "Todavía no hay operaciones en seguimiento. Los movimientos confirmados aparecen en tu historial."}</p>
        : <div className="vd-operations-list">{visible.map(item => (
          <a key={item.network + ":" + item.id}
            href={explorerForOperation(item)} target="_blank" rel="noopener noreferrer"
            className="vd-operations-entry">
            <span className={item.phase === "confirmed" ? "vd-operation-dot confirmed"
              : item.phase === "failed" ? "vd-operation-dot failed" : "vd-operation-dot pending"}/>
            <span className="vd-operation-details">
              <strong>{item.phase === "confirmed" ? (item.direction === "in" ? "Recibiste" : "Enviaste") : (item.direction === "in" ? "Ingreso" : "Envío")} {item.label}</strong>
              <small>{item.network === "polygon" ? "Polygon" : item.network === "base" ? "Base" : "Bitcoin"} · {phaseLabel(item.phase)}
                {item.confirmations !== null && item.confirmations > 0 ? " · " + item.confirmations + " conf." : ""}
              </small>
              <small>{formatTime(item.createdAt)} · {item.id.slice(0, 10)}…{item.id.slice(-8)}</small>
            </span>
            <Icon name="arrow" size={15}/>
          </a>
        ))}</div>
      }
      {!compact && completed.length > 5 && (
        <button type="button" className="vd-operations-older" onClick={() => setShowOlder(s => !s)}>
          {showOlder ? "Mostrar menos" : "Ver más operaciones"}
        </button>
      )}
      <p className="vd-operations-disclaimer">Un fallo al consultar la red no significa que el dinero se perdió. No repitas una transferencia pendiente sin verificar el hash.</p>
    </section>
  );
}

function AuthenticatedOperationMonitor({ compact }: { compact: boolean }) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded || !userId) return null;
  return <OperationMonitorInner key={userId} compact={compact}/>;
}

export function OperationMonitor({ compact = false }: { compact?: boolean }) {
  if (!authConfigured) return null;
  return <AuthenticatedOperationMonitor compact={compact}/>;
}
