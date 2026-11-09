"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PressButton } from "@/components/ui/press-button";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/brand/logo";
import { CryptoMark } from "@/components/brand/crypto-mark";
import { ExportWallet } from "@/components/wallet/export-wallet";
import { RecoverDevice } from "@/components/wallet/recover-device";
import { WALLET_READY_EVENT, WALLET_ENROLLMENT_ERROR_EVENT } from "@/components/wallet/auto-enrollment";

type WalletStatus = { canActivate: boolean; transfersEnabled: boolean;
  wallet: null | { organizationId: string; turnkeyUserId: string; walletId?: string; evmAddress?: string;
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
  const [verified, setVerified] = useState<boolean | null>(null);
  const [retry, setRetry] = useState(0);
  const activating = useRef(false);

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
    const controller = new AbortController();
    const result = new URLSearchParams(window.location.search).get("wallet");
    if (result) {
      const url = new URL(window.location.href);
      url.searchParams.delete("wallet");
      window.history.replaceState(null, "", url.pathname + url.search);
      if (callbackMessages[result]) setError(callbackMessages[result]);
    }
    setStatus(null);
    setVerified(null);
    (async () => {
      try {
        const response = await fetch("/api/wallet", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No pudimos consultar tu wallet.");
        if (controller.signal.aborted) return;
        setStatus(data);
        // La creación ya ocurre globalmente al iniciar sesión. No iniciamos
        // una segunda provisión desde el perfil ni generamos llaves duplicadas.
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

  useEffect(() => {
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId === userId) {
        setError("");
        setRetry((n) => n + 1);
      }
    };
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; message?: string }>).detail;
      if (detail?.userId === userId) setError(detail.message || "No pudimos generar tu wallet.");
    };
    window.addEventListener(WALLET_READY_EVENT, onReady);
    window.addEventListener(WALLET_ENROLLMENT_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(WALLET_READY_EVENT, onReady);
      window.removeEventListener(WALLET_ENROLLMENT_ERROR_EVENT, onError);
    };
  }, [userId]);

  return <WalletSetupView status={status} error={error} busy={busy} verified={verified} userId={userId}
    onRecovered={() => { setVerified(true); setError(""); }}
    onConnect={connect}
    onRetry={() => { setError(""); setRetry(n => n + 1); }} />;
}

/** Presentation only, shared by real account states and isolated visual review. */
export function WalletSetupView({ status, error, busy, verified, userId, onRecovered, onConnect, onRetry }: {
  status: WalletStatus | null; error: string; busy: boolean; verified: boolean | null;
  userId: string; onRecovered: () => void;
  onConnect: () => void; onRetry: () => void;
}) {
  return <section className="access-status wallet-setup" aria-busy={busy} aria-labelledby="wallet-title">
    <div className="wallet-status-line"><span className="eyebrow">MI WALLET</span><span className={"wallet-state" + (verified ? " connected" : "")}><i aria-hidden="true" />{status?.wallet ? verified ? "Dispositivo autorizado" : verified === null ? "Verificando acceso" : "Recuperar acceso" : status ? "Creación automática" : error ? "Sin conexión" : "Consultando"}</span></div>
    <div className="wallet-emblem" aria-hidden="true"><Logo size={58} /><span /></div>
    <div className="wallet-copy"><h2 id="wallet-title">{status?.wallet ? "Tu wallet" : "Tu wallet se crea automáticamente"}</h2>
    {status ? <p>{status.wallet
      ? verified ? "Tu wallet ya está vinculada a esta cuenta y a este dispositivo."
        : "Tu wallet ya existe. Para autorizar movimientos desde este dispositivo, recupera el acceso con tu correo."
      : status.canActivate ? "La generamos al registrar tu cuenta. La clave de firma se guarda en este dispositivo, no en la aplicación."
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
      {status?.wallet?.walletId ? (
        <ExportWallet
          wallet={{ organizationId: status.wallet.organizationId, walletId: status.wallet.walletId }}
          verified={verified}
        ></ExportWallet>
      ) : null}
      {error ? <div className="wallet-error"><Icon name="info" size={17} /><p role="alert">{error}</p></div> : null}
      {status.wallet && verified === false && <RecoverDevice userId={userId} onRecovered={onRecovered} context="autorizar tu wallet" />}
      <div className="wallet-action-area">
        {status.canActivate && !verified && !status.wallet && error ? <PressButton onClick={onConnect} disabled={busy}>
          {busy ? <span className="button-spinner" aria-hidden="true" /> : null}
          {busy ? "Activando…" : "Reintentar activación"}
          {!busy ? <Icon name="arrow" size={17} /> : null}
        </PressButton> : !status.wallet ? <PressButton href="/vanlink" variant="secondary">Ver mis VanLinks <Icon name="arrow" size={17} /></PressButton> : null}
        <p className="wallet-activation-note"><Icon name="shield" size={13} />{status.wallet
          ? verified ? "Tu dispositivo puede firmar operaciones que tú confirmes." : "Puedes recibir con la dirección de tu wallet. Para enviar, recupera este dispositivo."
          : "Al entrar generamos tu wallet automáticamente. No necesitas vincular una wallet externa."}</p>
      </div>
    </> : error ? <div className="wallet-error wallet-load-error"><Icon name="info" size={17} /><div><p role="alert">{error}</p><PressButton variant="secondary" onClick={onRetry}>Reintentar</PressButton></div></div> : <div className="wallet-loading-line" aria-hidden="true" />}
  </section>;
}
