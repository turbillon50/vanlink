"use client";

import { useCallback, useEffect, useState } from "react";
import { PressButton } from "@/components/ui/press-button";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/brand/logo";
import { CryptoMark } from "@/components/brand/crypto-mark";

type WalletStatus = { canActivate: boolean; transfersEnabled: false;
  wallet: null | { organizationId: string; turnkeyUserId: string; networks: string[] } };
const callbackMessages: Record<string, string> = {
  expired: "La conexión venció. Puedes intentarlo otra vez.",
  cancelled: "Cancelaste la conexión. Tu cuenta sigue disponible.",
  error: "No pudimos terminar de conectar tu wallet. Intenta de nuevo.",
  identity_error: "No pudimos confirmar tu sesión. Vuelve a intentar la conexión con tu misma cuenta.",
  wallet_error: "No pudimos completar la conexión. Reintenta con tu misma cuenta.",
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

  return <WalletSetupView status={status} error={error} busy={busy} verified={verified} onConnect={connect}
    onRetry={() => { setError(""); setRetry(n => n + 1); }} />;
}

/** Presentation only, shared by real account states and isolated visual review. */
export function WalletSetupView({ status, error, busy, verified, onConnect, onRetry }: {
  status: WalletStatus | null; error: string; busy: boolean; verified: boolean;
  onConnect: () => void; onRetry: () => void;
}) {
  return <section className="access-status wallet-setup" aria-busy={busy} aria-labelledby="wallet-title">
    <div className="wallet-status-line"><span className="eyebrow">MI WALLET</span><span className={"wallet-state" + (verified ? " connected" : "")}><i aria-hidden="true" />{status?.wallet ? verified ? "Dispositivo conectado" : "Wallet creada" : status ? "Por activar" : error ? "Sin conexión" : "Consultando"}</span></div>
    <div className="wallet-emblem" aria-hidden="true"><Logo size={58} /><span /></div>
    <div className="wallet-copy"><h2 id="wallet-title">{status?.wallet ? "Tu wallet" : "Activa tu wallet"}</h2>
    {status ? <p>{status.wallet
      ? verified ? "Tu wallet ya está vinculada a esta cuenta y a este dispositivo."
        : "Tu wallet está guardada. Conecta este dispositivo para continuar."
      : status.canActivate ? "Vincula tu wallet a la cuenta con la que iniciaste sesión."
        : "Tu cuenta está lista. Estamos preparando la activación de tu wallet."}</p>
      : !error ? <p role="status">Consultando tu wallet…</p> : null}
    </div>
    {status ? <>
      <div className="wallet-network-list"><span><CryptoMark asset="USDC" size={19} />USDC <em>en Base</em></span><span className="wallet-future">Bitcoin <em>Próximamente</em></span></div>
      {error ? <div className="wallet-error"><Icon name="info" size={17} /><p role="alert">{error}</p></div> : null}
      <div className="wallet-action-area">
        {status.canActivate && !verified ? <PressButton onClick={onConnect} disabled={busy}>
          {busy ? <span className="button-spinner" aria-hidden="true" /> : null}
          {busy ? "Conectando…" : status.wallet ? "Conectar dispositivo" : error ? "Reintentar conexión" : "Activar mi wallet"}
          {!busy ? <Icon name="arrow" size={17} /> : null}
        </PressButton> : !status.wallet ? <PressButton href="/vanlink" variant="secondary">Ver mis VanLinks <Icon name="arrow" size={17} /></PressButton> : null}
        <p className="wallet-activation-note"><Icon name="shield" size={13} />Los depósitos y envíos todavía no están disponibles.</p>
      </div>
    </> : error ? <div className="wallet-error wallet-load-error"><Icon name="info" size={17} /><div><p role="alert">{error}</p><PressButton variant="secondary" onClick={onRetry}>Reintentar</PressButton></div></div> : <div className="wallet-loading-line" aria-hidden="true" />}
  </section>;
}
