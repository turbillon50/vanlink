"use client";

/**
 * components/wallet/activity-list.tsx
 * Movimientos reales de Polygon, Base y Bitcoin. Distingue tres estados que no son
 * lo mismo: sin wallet, sin movimientos, y no pudimos leer una red.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { authConfigured } from "@/lib/auth-config";

type Movement = {
  id: string; network: "Polygon" | "Base" | "Bitcoin"; direction: "in" | "out";
  token: string; amount: string; counterparty: string | null;
  at: string | null; confirmed: boolean; explorer: string;
};
type Response = { wallet: unknown; movements: Movement[]; unavailable?: string[]; baseRecentOnly?: boolean; baseScannedBlocks?: number | null };

function when(iso: string | null) {
  if (!iso) return "Hora no disponible";
  const date = new Date(iso);
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
    + " · " + date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function short(address: string | null) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type ActivityFilter = "all" | "in" | "out";

export function ActivityList({ filter }: { filter: ActivityFilter }) {
  if (!authConfigured) return <p className="bal-note">Inicia sesión o entra a tu wallet para consultar los movimientos.</p>;
  return <AuthenticatedActivityList filter={filter} />;
}

function AuthenticatedActivityList({ filter }: { filter: ActivityFilter }) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded) return <div className="act-skeleton" aria-label="Cargando movimientos" />;
  if (!userId) return <p className="bal-note">Inicia sesión o entra a tu wallet para consultar los movimientos.</p>;
  // Remount before rendering a different account so no previous wallet can flash.
  return <UserActivityList key={userId} filter={filter} userId={userId} />;
}

function UserActivityList({ filter, userId }: { filter: ActivityFilter; userId: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [state, setState] = useState<"cargando" | "listo" | "sin-wallet" | "error">("cargando");

  useEffect(() => {
    setData(null);
    setState("cargando");
    let active = true;
    let running = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const r = await fetch("/api/chain/activity", { cache: "no-store", signal: controller.signal });
        if (r.status === 401) {
          if (active) { setData(null); setState("sin-wallet"); }
          return;
        }
        if (!r.ok) throw new Error("activity");
        const payload = (await r.json()) as Response;
        if (!active) return;
        setData(payload);
        setState(payload.wallet ? "listo" : "sin-wallet");
      } catch {
        if (active) setState(previous => previous === "listo" ? previous : "error");
      } finally { running = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 45_000);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [userId]);

  if (state === "cargando") return <div className="act-skeleton" aria-label="Cargando movimientos" />;
  if (state === "sin-wallet") {
    return <p className="bal-note">Inicia sesión o entra a tu wallet para consultar los movimientos.</p>;
  }
  if (state === "error" || !data) {
    return <p className="bal-note">No pudimos leer tu actividad ahora. Intenta de nuevo.</p>;
  }

  const list = data.movements.filter((m) => filter === "all" || m.direction === filter);

  return (
    <>
      {data.baseRecentOnly && <p className="act-partial">Base: se verificaron sólo las operaciones recientes que permite consultar el nodo público. No es un historial completo; puedes usar «Comprobar un movimiento» para revisar un depósito.</p>}
      {(data.unavailable?.length ?? 0) > 0 && (
        <p className="act-partial">
          No pudimos consultar {data.unavailable!.join(" ni ")}. Lo que ves puede estar incompleto.
        </p>
      )}
      {list.length === 0 ? (
        <p className="bal-note">
          {filter === "all" ? (data.baseRecentOnly ? "No encontramos movimientos en la ventana reciente consultada." : "Todavía no hay movimientos.")
            : filter === "in" ? "Aún no hay entradas." : "Aún no hay salidas."}
        </p>
      ) : (
        <ul className="act-list">
          {list.map((m) => (
            <li key={m.id} className="act-row">
              <a href={m.explorer} target="_blank" rel="noopener noreferrer">
                <span className={m.direction === "in" ? "act-arrow in" : "act-arrow out"} aria-hidden="true">
                  {m.direction === "in" ? "↓" : "↑"}
                </span>
                <span className="act-main">
                  <strong>{m.direction === "in" ? "Recibiste" : "Enviaste"} {m.token}</strong>
                  <small>
                    {m.network}
                    {m.counterparty ? ` · ${short(m.counterparty)}` : ""}
                    {!m.confirmed ? " · sin confirmar" : ""}
                  </small>
                </span>
                <span className="act-amount">
                  <strong className={m.direction === "in" ? "in" : "out"}>
                    {m.direction === "in" ? "+" : "−"}{m.amount}
                  </strong>
                  <small>{when(m.at)}</small>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
