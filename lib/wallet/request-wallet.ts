"use client";

import { enrollWalletIfMissing, type WalletLookup } from "@/lib/wallet/onboarding";

export const WALLET_READY_EVENT = "vandefi:wallet-ready";

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

export async function requestWallet(userId: string): Promise<void> {
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
        body: JSON.stringify({ publicKey, intent: "create_wallet", requestedFor: userId }),
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

export function enrollmentMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "wallet_not_available") return "El servicio de wallets no está habilitado en este momento.";
  if (message === "wallet_device_legacy_unknown") return "Este navegador conserva una llave anterior. Entra en la cuenta donde la creaste para comprobarla, o usa otro navegador para esta cuenta.";
  if (message === "wallet_device_owner_mismatch") return "Este navegador conserva una llave de otra cuenta. No la reemplazamos para evitar perder fondos. Abre esta cuenta en otro navegador o contacta soporte.";
  if (message === "wallet_not_confirmed" || message === "wallet_accounts_missing")
    return "Turnkey no confirmó todas las direcciones. Puedes reintentar sin crear una wallet duplicada.";
  if (message === "wallet_device_invalid") return "El dispositivo no pudo preparar una llave válida.";
  if (/Network|fetch|conexión|internet/i.test(message)) return "Sin conexión al crear tu wallet. Reintenta al recuperar internet.";
  return message && message.length < 110 && !/(_|secret|key|token)/i.test(message)
    ? message
    : "No pudimos completar tu wallet. Reintenta desde esta cuenta.";
}
