"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import {
  TRACKING_EVENT, explorerForOperation, isValidTransactionId,
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

export function OperationMonitor({ compact = false }: { compact?: boolean }) {
  const { userId, isLoaded } = useAuth();
  const [operations, setOperations] = useState<TrackedOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [message, setMessage] = useState("");
  const [showOlder, setShowOlder] = useState(false);
  const running = useRef(false);

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
    if (!userId) return;
    let active = true;
    const checkAll = async () => {
      if (!active || running.current || document.visibilityState === "hidden") return;
      running.current = true;
      const pending = readTrackedOperations(userId)
        .filter(item => item.phase !== "confirmed" && item.phase !== "failed")
        .slice(0, 10);
      try {
        await Promise.allSettled(pending.map(async item => {
          try {
            const response = await fetchStatus(item);
            if (!active) return;
            const phase = response.phase ?? (response.confirmed ? "confirmed" : response.failed ? "failed" : "pending");
            reconcileOperation(userId, item.id, item.network, {
              phase, confirmations: response.confirmations ?? null,
              checkedAt: response.checkedAt || new Date().toISOString(),
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
    if (!isValidTransactionId("base", hash)) {
      setMessage("Escribe un hash válido de Base (0x + 64 caracteres hexadecimales).");
      return;
    }
    setMessage("");
    setLoading(true);
    try {
      const response = await fetchStatus({ network: "base", id: hash });
      if (response.phase === "not_seen") {
        setMessage("La red Base aún no localiza ese hash. Revisa el enlace o vuelve a comprobar.");
        return;
      }
      const transfer = response.transfers?.find(item => item.direction === "in" && item.token === "USDC");
      if (!transfer) {
        setMessage("El hash existe, pero todavía no se comprobó un ingreso de USDC a tu dirección.");
        return;
      }
      if (!trackOperation(userId, {
        id: hash, network: "base", direction: "in",
        label: transfer.amount + " USDC",
      })) {
        setMessage("Esta PWA no pudo conservar el seguimiento. Guarda el hash del comprobante.");
        return;
      }
      reconcileOperation(userId, hash, "base", {
        phase: response.phase ?? "confirming",
        confirmations: response.confirmations ?? null,
        checkedAt: response.checkedAt || new Date().toISOString(),
      });
      setTxHash("");
      setMessage("Ingreso USDC localizado. Puedes ver su estado abajo.");
    } catch {
      setMessage("La red no respondió. El ingreso puede existir; no vuelvas a pedir otro envío por este error.");
    } finally { setLoading(false); }
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
          <p className="vd-overline">BLOCKCHAIN · BASE / BITCOIN</p>
          <h2>Seguimiento de operaciones</h2>
        </div>
        {active.length > 0 && <span className="vd-operations-count">{active.length} por verificar</span>}
      </div>
      <p className="vd-operations-explainer">
        Se conserva el hash de tus operaciones en esta instalación. La red confirma si fueron incluidas o si fallaron.
      </p>
      {!compact && (
        <form className="vd-operations-lookup" onSubmit={checkIncoming}>
          <label htmlFor="vd-operation-txid">¿Te mandaron USDC por Base? Comprueba el hash del depósito</label>
          <div>
            <input id="vd-operation-txid" value={txHash} onChange={e => setTxHash(e.target.value.trim())}
              placeholder="0x… Hash de Base" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              aria-describedby={message ? "vd-operation-feedback" : undefined}/>
            <button type="submit" disabled={loading || !txHash.trim()}>
              {loading ? "Buscando…" : "Comprobar"}
            </button>
          </div>
          {message && <p id="vd-operation-feedback" role="status">{message}</p>}
        </form>
      )}
      {visible.length === 0
        ? <p className="vd-no-operations">Todavía no hay operaciones guardadas en este dispositivo. Los movimientos de la blockchain aparecen en el historial de abajo.</p>
        : <div className="vd-operations-list">{visible.map(item => (
          <a key={item.network + ":" + item.id}
            href={explorerForOperation(item)} target="_blank" rel="noopener noreferrer"
            className="vd-operations-entry">
            <span className={item.phase === "confirmed" ? "vd-operation-dot confirmed"
              : item.phase === "failed" ? "vd-operation-dot failed" : "vd-operation-dot pending"}/>
            <span className="vd-operation-details">
              <strong>{item.direction === "in" ? "Recibiste" : "Enviaste"} {item.label}</strong>
              <small>{item.network === "base" ? "Base" : "Bitcoin"} · {phaseLabel(item.phase)}
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
          {showOlder ? "Mostrar menos" : "Ver más operaciones de este dispositivo"}
        </button>
      )}
      <p className="vd-operations-disclaimer">Un fallo al consultar la red no significa que el dinero se perdió. No repitas una transferencia pendiente sin verificar el hash.</p>
    </section>
  );
}
