"use client";

import { useCallback, useEffect, useState } from "react";
import { PressButton } from "@/components/ui/press-button";
import { Icon } from "@/components/icons";

type WalletStatus = { canActivate: boolean; transfersEnabled: false;
  wallet: null | { organizationId: string; turnkeyUserId: string; networks: string[] } };
const callbackMessages: Record<string, string> = {
  expired: "La conexión venció. Puedes intentarlo otra vez.",
  cancelled: "Cancelaste la conexión. Tu cuenta sigue disponible.",
  error: "No pudimos terminar de conectar tu wallet. Intenta de nuevo.",
  unavailable: "Estamos terminando la conexión de wallets.",
};

export function WalletSetup({ userId }: { userId: string }) {
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const result = new URLSearchParams(window.location.search).get("wallet");
    if (result) {
      const url = new URL(window.location.href);
      url.searchParams.delete("wallet");
      window.history.replaceState(null, "", url.pathname + url.search);
      if (callbackMessages[result]) setError(callbackMessages[result]);
    }
    setStatus(null);
    setVerified(false);
    (async () => {
      try {
        const response = await fetch("/api/wallet", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No pudimos consultar tu wallet.");
        if (controller.signal.aborted) return;
        setStatus(data);
        if (data.wallet) {
          const { verifyWalletDevice } = await import("@/lib/wallet/browser");
          const ok = await verifyWalletDevice(userId, data.wallet.organizationId, data.wallet.turnkeyUserId).catch(() => false);
          if (!controller.signal.aborted) setVerified(ok);
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "No pudimos consultar tu wallet.");
      }
    })();
    return () => controller.abort();
  }, [userId, retry]);

  const connect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { prepareWalletDevice } = await import("@/lib/wallet/browser");
      const publicKey = await prepareWalletDevice(userId);
      const response = await fetch("/api/wallet/start", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos conectar tu wallet.");
      window.location.assign(data.url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No pudimos preparar este dispositivo.");
      setBusy(false);
    }
  }, [busy, userId]);

  return <section className="access-status wallet-setup" aria-busy={busy}>
    <div className="section-heading"><span className="eyebrow">TU WALLET</span><Icon name="wallet" size={22} /></div>
    <h2>{status?.wallet ? "Tu wallet, vinculada" : "Tu dinero empieza aquí"}</h2>
    {status ? <>
      <p>{status.wallet
        ? verified ? "Tu dispositivo ya está conectado. Los envíos y la recepción de fondos siguen en preparación."
          : "Tu wallet está guardada en tu cuenta. Conecta este dispositivo cuando quieras continuar."
        : status.canActivate ? "Activa tu wallet con la misma cuenta. Solo necesitas confirmar la conexión."
          : "Tu cuenta está lista. Estamos terminando la conexión para activar tu wallet."}</p>
      <div className="wallet-network-list"><span>USDC · Base</span><span>Bitcoin · Próximamente</span></div>
      {status.canActivate && !verified ? <PressButton onClick={connect} disabled={busy}>
        {busy ? "Conectando…" : status.wallet ? "Conectar este dispositivo" : "Activar mi wallet"}
        {!busy ? <Icon name="arrow" size={17} /> : null}
      </PressButton> : !status.wallet ? <PressButton href="/vanlink">Ver mis VanLinks <Icon name="arrow" size={17} /></PressButton> : null}
    </> : !error ? <p role="status">Consultando tu wallet…</p> : null}
    {error ? <div className="wallet-error"><p role="alert">{error}</p>
      {!status ? <PressButton variant="secondary" onClick={() => { setError(""); setRetry(n => n + 1); }}>Reintentar</PressButton> : null}
    </div> : null}
  </section>;
}
