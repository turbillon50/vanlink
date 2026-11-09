"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { enrollWalletIfMissing, type WalletLookup } from "@/lib/wallet/onboarding";

export const WALLET_READY_EVENT = "vandefi:wallet-ready";
export const WALLET_RETRY_EVENT = "vandefi:wallet-retry";
export const WALLET_ENROLLMENT_ERROR_EVENT = "vandefi:wallet-enrollment-error";

// One job per user in this tab. React StrictMode, navigation and two mounted
// onboarding surfaces must never create parallel Turnkey organizations.
const inFlight = new Map<string, Promise<void>>();

async function lookup(): Promise<WalletLookup> {
  const response = await fetch("/api/wallet", { cache: "no-store", credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No pudimos consultar tu wallet.");
  return data as WalletLookup;
}

async function withDeviceLock<T>(operation: () => Promise<T>): Promise<T> {
  // IndexedDbStamper shares one browser key. Two registration tabs must not
  // reset that key concurrently. Web Locks are supported on modern browsers.
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("vandefi.wallet.enrollment", { mode: "exclusive" }, operation);
  }
  return operation();
}

async function enroll(userId: string): Promise<void> {
  const job = inFlight.get(userId);
  if (job) return job;

  const pending = withDeviceLock(() => enrollWalletIfMissing({
    lookup,
    prepareDevice: async () => {
      const { prepareWalletDevice } = await import("@/lib/wallet/browser");
      return prepareWalletDevice(userId);
    },
    provision: async (publicKey) => {
      const response = await fetch("/api/wallet/start", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No pudimos crear tu wallet.");
      if (data.connected !== true) throw new Error("wallet_not_confirmed");
    },
  })).then(() => undefined);

  inFlight.set(userId, pending);
  // Cleanup is explicit to avoid unhandled promise rejections from finally().
  void pending.then(
    () => { if (inFlight.get(userId) === pending) inFlight.delete(userId); },
    () => { if (inFlight.get(userId) === pending) inFlight.delete(userId); },
  );
  return pending;
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "wallet_not_available") return "El servicio de wallets no está habilitado en este momento.";
  if (message === "wallet_device_owner_mismatch") return "Este navegador conserva una llave de otra cuenta. No la reemplazamos para evitar perder fondos. Abre esta cuenta en otro navegador o contacta soporte.";
  if (message === "wallet_not_confirmed" || message === "wallet_accounts_missing")
    return "Turnkey no confirmó todas las direcciones. Puedes reintentar sin crear una wallet duplicada.";
  if (message === "wallet_device_invalid") return "El dispositivo no pudo preparar una llave válida.";
  if (/Network|fetch|conexión|internet/i.test(message)) return "Sin conexión al crear tu wallet. Reintenta al recuperar internet.";
  return message && message.length < 110 && !/(_|secret|key|token)/i.test(message)
    ? message
    : "No pudimos completar tu wallet. Reintenta desde esta cuenta.";
}

/**
 * Hook del alta de Clerk. No bloquea la PWA ni reclama acciones del usuario.
 * Si la wallet existe se conserva; si no existe, genera una sola vez la
 * credencial no extraíble en el navegador y registra Bitcoin + EVM en Turnkey.
 */
export function AutoWalletEnrollment() {
  const { isLoaded, user } = useUser();
  const userId = user?.id;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;
    setError(null);
    if (!userId) {
      // Logout must NOT destroy an unexportable device key: an old wallet with
      // no configured email recovery could otherwise be permanently stranded.
      return;
    }

    let active = true;
    void enroll(userId).then(() => {
      if (!active) return;
      window.dispatchEvent(new CustomEvent(WALLET_READY_EVENT, { detail: { userId } }));
    }, (cause: unknown) => {
      if (!active) return;
      const message = describeError(cause);
      setError(message);
      window.dispatchEvent(new CustomEvent(WALLET_ENROLLMENT_ERROR_EVENT, { detail: { userId, message } }));
    });
    return () => { active = false; };
  }, [isLoaded, userId, attempt]);

  useEffect(() => {
    if (!userId) return;
    const retry = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId === userId) setAttempt((n) => n + 1);
    };
    window.addEventListener(WALLET_RETRY_EVENT, retry);
    return () => window.removeEventListener(WALLET_RETRY_EVENT, retry);
  }, [userId]);

  if (!isLoaded || !userId || !error) return null;
  return (
    <aside className="vd-wallet-enrollment-error" role="status" aria-live="polite">
      <span>{error}</span>
      <div>
        <button type="button" onClick={() => setAttempt((v) => v + 1)}>Reintentar</button>
        <Link href="/profile">Ver mi wallet</Link>
      </div>
    </aside>
  );
}
