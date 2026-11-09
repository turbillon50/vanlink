"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PressButton } from "@/components/ui/press-button";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/brand/logo";
import { useWalletMode } from "@/components/mode/wallet-mode";
import { ExportWallet } from "@/components/wallet/export-wallet";
import { DeviceCheck } from "@/components/wallet/device-check";
import { WALLET_READY_EVENT, WALLET_ENROLLMENT_ERROR_EVENT, WALLET_RETRY_EVENT } from "@/components/wallet/auto-enrollment";

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
  return <WalletSetupInner key={userId} userId={userId}/>;
}

function WalletSetupInner({ userId }: { userId: string }) {
  const { mode } = useWalletMode();
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [retry, setRetry] = useState(0);
  const activating = useRef(false);

  const connect = useCallback(() => {
    if (activating.current) return;
    activating.current = true;
    setBusy(true);
    setError("");
    // El perfil NO administra su propia llave ni manda un segundo POST.
    // Reutiliza el mismo hook global, con bloqueo entre pestañas.
    window.dispatchEvent(new CustomEvent(WALLET_RETRY_EVENT, { detail: { userId } }));
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
        activating.current = false;
        setBusy(false);
        setError("");
        setRetry((n) => n + 1);
      }
    };
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; message?: string }>).detail;
      if (detail?.userId === userId) { activating.current = false; setBusy(false); setError(detail.message || "No pudimos generar tu wallet."); }
    };
    window.addEventListener(WALLET_READY_EVENT, onReady);
    window.addEventListener(WALLET_ENROLLMENT_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(WALLET_READY_EVENT, onReady);
      window.removeEventListener(WALLET_ENROLLMENT_ERROR_EVENT, onError);
    };
  }, [userId]);

  return <WalletSetupView status={status} error={error} busy={busy} verified={verified} userId={userId} expert={mode === "expert"}
    onRecovered={() => { setVerified(true); setError(""); }}
    onConnect={connect}
    onRetry={() => { setError(""); setRetry(n => n + 1); }} />;
}

/** Presentation only, shared by real account states and isolated visual review. */
export function WalletSetupView({ status, error, busy, verified, userId, onRecovered, onConnect, onRetry, expert = false }: {
  status: WalletStatus | null; error: string; busy: boolean; verified: boolean | null;
  userId: string; onRecovered: () => void;
  onConnect: () => void; onRetry: () => void; expert?: boolean;
}) {
  return <section className="access-status wallet-setup" aria-busy={busy} aria-labelledby="wallet-title">
    <div className="wallet-status-line"><span className="eyebrow">MI WALLET</span><span className={"wallet-state" + (verified ? " connected" : "")}><i aria-hidden="true" />{status?.wallet ? verified ? "Acceso reconocido" : verified === null ? "Verificando acceso" : "Acceso por comprobar" : status ? "Creación automática" : error ? "Sin conexión" : "Consultando"}</span></div>
    <div className="wallet-emblem" aria-hidden="true"><Logo size={58} /><span /></div>
    <div className="wallet-copy"><h2 id="wallet-title">{status?.wallet ? "Tu wallet" : "Tu wallet se crea automáticamente"}</h2>
    {status ? <p>{status.wallet
      ? verified ? "Tu wallet está vinculada a esta cuenta. Comprueba la firma de este dispositivo sin mover fondos."
        : "Tu wallet ya existe. Comprueba la firma para saber si este navegador puede autorizar movimientos."
      : status.canActivate ? "La generamos al registrar tu cuenta. La clave de firma se guarda en este dispositivo, no en la aplicación."
        : "Tu cuenta está lista. Estamos preparando la activación de tu wallet."}</p>
      : !error ? <p role="status">Consultando tu wallet…</p> : null}
    </div>
    {status ? <>
      <div className="wallet-network-list"><span>USDT <em>en Polygon PoS</em></span>
        {expert && <><span className="wallet-future">USDC <em>Base · histórico</em></span><span className="wallet-future">BTC <em>Bitcoin · histórico</em></span></>}
      </div>
      {status?.wallet?.evmAddress ? (
        <div className="wallet-address-list">
          <WalletAddress label="Polygon PoS · EVM" value={status.wallet.evmAddress} />
          {expert && status.wallet.bitcoinAddress ? (
            <WalletAddress label="Bitcoin · histórico" value={status.wallet.bitcoinAddress} />
          ) : null}
        </div>
      ) : null}
      {status?.wallet?.walletId ? (
        <ExportWallet
          wallet={{ organizationId: status.wallet.organizationId, walletId: status.wallet.walletId }}
          verified={verified === true}
        ></ExportWallet>
      ) : null}
      {error ? <div className="wallet-error"><Icon name="info" size={17} /><p role="alert">{error}</p></div> : null}
      {status.wallet?.evmAddress && <DeviceCheck key={userId + ":" + status.wallet.organizationId}
        userId={userId} wallet={{ organizationId: status.wallet.organizationId, turnkeyUserId: status.wallet.turnkeyUserId, evmAddress: status.wallet.evmAddress }}
        onRecovered={onRecovered}/>}
      <div className="wallet-action-area">
        {status.canActivate && !verified && !status.wallet && error ? <PressButton onClick={onConnect} disabled={busy}>
          {busy ? <span className="button-spinner" aria-hidden="true" /> : null}
          {busy ? "Activando…" : "Reintentar activación"}
          {!busy ? <Icon name="arrow" size={17} /> : null}
        </PressButton> : !status.wallet ? <PressButton href="/vanlink" variant="secondary">Ver mis VanLinks <Icon name="arrow" size={17} /></PressButton> : null}
        <p className="wallet-activation-note"><Icon name="shield" size={13} />{status.wallet
          ? verified ? "Comprueba la firma antes de autorizar movimientos." : "Ver tu saldo no confirma que este navegador pueda firmar. Usa la comprobación de arriba."
          : "Al entrar generamos tu wallet automáticamente. No necesitas vincular una wallet externa."}</p>
      </div>
    </> : error ? <div className="wallet-error wallet-load-error"><Icon name="info" size={17} /><div><p role="alert">{error}</p><PressButton variant="secondary" onClick={onRetry}>Reintentar</PressButton></div></div> : <div className="wallet-loading-line" aria-hidden="true" />}
  </section>;
}
