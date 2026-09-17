"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PressButton } from "@/components/ui/press-button";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/brand/logo";
import { CryptoMark } from "@/components/brand/crypto-mark";

type WalletStatus = { canActivate: boolean; transfersEnabled: false;
  wallet: null | { organizationId: string; turnkeyUserId: string; evmAddress?: string;
    bitcoinAddress?: string; networks: string[] } };
const callbackMessages: Record<string, string> = {
  expired: "La conexión venció. Puedes intentarlo otra vez.",
  unavailable: "Estamos terminando la conexión de wallets.",
};

function WalletAddress({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="wallet-address">
      <span className="eyebrow">{label}</span>
      <code title={value}>{value.slice(0, 10)}…{value.slice(-8)}</code>
      <button type="button" onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true); setTimeout(() => setCopied(false), 1800);
        }).catch(() => undefined);
      }}>{copied ? "Copiada" : "Copiar"}</button>
    </div>
  );
}

export function WalletSetup({ userId }: { userId: string }) {
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [retry, setRetry] = useState(0);
  const activating = useRef(false);
  const automaticAttempted = useRef(false);

  const connect = useCallback(async () => {
    if (activating.current) return;
    activating.current = true;
    setBusy(true);
    setError("");
    try {
      const { prepareWalletDevice } = await import("@/lib/wallet/browser");
      const publicKey = await prepareWalletDevice(userId);
      const response = await fetch("/api/wallet/start", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos activar tu wallet.");
      setRetry(n => n + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No pudimos preparar este dispositivo.");
    } finally {
      activating.current = false;
      setBusy(false);
    }
  }, [userId]);

  useEffect(() => {
    automaticAttempted.current = false;
  }, [userId]);

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
        // Registration redirects here. Enrollment happens automatically only after
        // Clerk has authenticated the user and this browser has made its local key.
        if (!data.wallet && data.canActivate && !automaticAttempted.current) {
          automaticAttempted.current = true;
          void connect();
          return;
        }
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
  }, [connect, userId, retry]);

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
        : "Esta wallet se activó desde otro dispositivo. La conexión de un segundo dispositivo llegará antes de habilitar movimientos."
      : status.canActivate ? "La estamos creando en este dispositivo. Tu llave privada no sale de tu navegador."
        : "Tu cuenta está lista. Estamos preparando la activación de tu wallet."}</p>
      : !error ? <p role="status">Consultando tu wallet…</p> : null}
    </div>
    {status ? <>
      <div className="wallet-network-list"><span><CryptoMark asset="USDC" size={19} />USDC <em>en Base</em></span><span className="wallet-future">BTC <em>en Bitcoin</em></span></div>
      {status?.wallet?.evmAddress ? (
        <div className="wallet-address-list">
          <WalletAddress label="Base (EVM)" value={status.wallet.evmAddress} />
          {status.wallet.bitcoinAddress ? (
            <WalletAddress label="Bitcoin" value={status.wallet.bitcoinAddress} />
          ) : null}
        </div>
      ) : null}
      {error ? <div className="wallet-error"><Icon name="info" size={17} /><p role="alert">{error}</p></div> : null}
      <div className="wallet-action-area">
        {status.canActivate && !verified && !status.wallet && error ? <PressButton onClick={onConnect} disabled={busy}>
          {busy ? <span className="button-spinner" aria-hidden="true" /> : null}
          {busy ? "Activando…" : "Reintentar activación"}
          {!busy ? <Icon name="arrow" size={17} /> : null}
        </PressButton> : !status.wallet ? <PressButton href="/vanlink" variant="secondary">Ver mis VanLinks <Icon name="arrow" size={17} /></PressButton> : null}
        <p className="wallet-activation-note"><Icon name="shield" size={13} />Los depósitos y envíos todavía no están disponibles.</p>
      </div>
    </> : error ? <div className="wallet-error wallet-load-error"><Icon name="info" size={17} /><div><p role="alert">{error}</p><PressButton variant="secondary" onClick={onRetry}>Reintentar</PressButton></div></div> : <div className="wallet-loading-line" aria-hidden="true" />}
  </section>;
}
