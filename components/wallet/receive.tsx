"use client";

/**
 * components/wallet/receive.tsx
 * Recibir: QR + dirección real de cada red. No requiere firmar nada, por eso
 * funciona aunque el dispositivo no esté autorizado para enviar.
 *
 * Cuidado deliberado: la dirección se muestra partida en bloques para que sea
 * legible y verificable a simple vista, y siempre se copia completa.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { authConfigured } from "@/lib/auth-config";
import Link from "next/link";
import QRCode from "qrcode";
import { useWalletMode } from "@/components/mode/wallet-mode";

type Wallet = { evmAddress: string; bitcoinAddress: string };

const NETWORKS = [
  { id: "polygon", label: "Polygon", hint: "Sólo USDT en la red Polygon", warn: "Esta dirección recibe USDT por la red Polygon (Polygon PoS). Si te envían por TRON (TRC20), Ethereum, BNB u otra red, el dinero se pierde." },
  { id: "base", label: "Base · legado", hint: "Activos existentes en Base", warn: "Sólo red Base. No se convierte automáticamente a Polygon." },
  { id: "bitcoin", label: "Bitcoin · legado", hint: "Bitcoin nativo", warn: "Sólo BTC de la red Bitcoin. No envíes desde otra red." },
] as const;

function chunk(address: string) {
  return address.replace(/(.{4})/g, "$1 ").trim();
}

function ReceivePanelInner() {
  const { userId, isLoaded } = useAuth();
  const { mode } = useWalletMode();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [state, setState] = useState<"cargando" | "listo" | "sin-sesion" | "sin-wallet" | "error">("cargando");
  const [network, setNetwork] = useState<"polygon" | "base" | "bitcoin">("polygon");
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [clipboardError, setClipboardError] = useState(false);
  const [walletVersion, setWalletVersion] = useState(0);
  const [polygonReady, setPolygonReady] = useState(false);

  useEffect(() => {
    const ready = () => setWalletVersion((n) => n + 1);
    window.addEventListener("vandefi:wallet-ready", ready);
    return () => window.removeEventListener("vandefi:wallet-ready", ready);
  }, []);

  useEffect(() => {
    let live = true;
    void fetch("/api/chain/polygon", { cache: "no-store" })
      .then(async r => r.ok ? r.json() as Promise<{ receiveEnabled?: boolean }> : null)
      .then(result => { if (live) setPolygonReady(result?.receiveEnabled === true); })
      .catch(() => { if (live) setPolygonReady(false); });
    return () => { live = false; };
  }, [walletVersion]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      setWallet(null);
      setState("sin-sesion");
      setQr("");
      return;
    }
    let active = true;
    setWallet(null);
    setState("cargando");
    setQr("");
    void (async () => {
      try {
        const response = await fetch("/api/chain/balance", { cache: "no-store" });
        if (response.status === 401) {
          if (active) setState("sin-sesion");
          return;
        }
        if (!response.ok) throw new Error("wallet");
        const data = await response.json() as { wallet: Wallet | null };
        if (!active) return;
        if (!data.wallet) {
          setState("sin-wallet");
          return;
        }
        const evmValid = /^0x[0-9a-fA-F]{40}$/.test(data.wallet.evmAddress);
        const btcValid = /^(bc1|[13])/.test(data.wallet.bitcoinAddress);
        if (!evmValid || !btcValid) throw new Error("invalid_wallet_addresses");
        setWallet(data.wallet);
        setState("listo");
      } catch {
        if (active) setState("error");
      }
    })();
    return () => { active = false; };
  }, [walletVersion, isLoaded, userId]);

  useEffect(() => {
    if (mode === "simple" && network !== "polygon") setNetwork("polygon");
  }, [mode, network]);

  const address = useMemo(() => {
    if (!wallet) return "";
    return network === "bitcoin" ? wallet.bitcoinAddress : wallet.evmAddress;
  }, [wallet, network]);

  useEffect(() => {
    setQr("");
    if (!address) return;
    let active = true;
    void QRCode.toDataURL(address, {
      margin: 4,
      width: 512,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    }).then((url) => { if (active) setQr(url); }).catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [address]);

  if (state === "cargando") return <div className="rcv-skeleton" aria-label="Cargando" />;
  if (state === "sin-sesion") return <div className="snd-gate"><p>Entra con tu cuenta para ver el QR de tu wallet.</p><Link href="/login" className="vd-small-outline">Iniciar sesión</Link></div>;
  if (state === "sin-wallet") {
    return <p className="bal-note">Estamos generando tu wallet. Podrás recibir cuando aparezcan tus direcciones.</p>;
  }
  if (state === "error" || !wallet) {
    return <p className="bal-note">No pudimos cargar tus direcciones. Intenta de nuevo.</p>;
  }

  const current = NETWORKS.find((n) => n.id === network)!;
  if (network === "polygon" && !polygonReady) {
    return <div className="snd-gate" role="status">
      <strong>USDT en Polygon · recepción en preparación</strong>
      <p>La dirección EVM de tu wallet funciona también en Polygon, pero no habilitaremos depósitos hasta comprobar los envíos y las comisiones. No mandes dinero a Polygon todavía.</p>
      <p>Las direcciones antiguas de Base y Bitcoin siguen accesibles desde el modo Experto.</p>
    </div>;
  }

  return (
    <div className="rcv">
      <div className="rcv-tabs" role="tablist" aria-label="Red">
        {(mode === "simple" ? NETWORKS.filter((n) => n.id === "polygon") : NETWORKS).map((n) => (
          <button
            key={n.id}
            role="tab"
            type="button"
            aria-selected={network === n.id}
            className={network === n.id ? "rcv-tab active" : "rcv-tab"}
            onClick={() => { setQr(""); setNetwork(n.id); setCopied(false); setClipboardError(false); }}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className="rcv-qr-wrap">
        {qr ? (
          // El QR se genera en el navegador: la dirección no viaja a ningún lado.
          <img src={qr} alt={`Código QR de tu dirección de ${current.label}`} className="rcv-qr" />
        ) : (
          <div className="rcv-qr rcv-qr-loading" aria-hidden="true" />
        )}
      </div>

      <p className="rcv-hint">{current.hint}</p>
      <code className="rcv-address" title={address}>{chunk(address)}</code>

      <div className="rcv-actions">
        <button
          type="button"
          className="rcv-copy"
          onClick={() => {
            navigator.clipboard?.writeText(address).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1900);
            }).catch(() => setClipboardError(true));
          }}
        >
          {copied ? "Dirección copiada" : "Copiar dirección"}
        </button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            type="button"
            className="rcv-share"
            onClick={() => {
              void navigator.share({ title: `Mi dirección de ${current.label}`, text: address });
            }}
          >
            Compartir
          </button>
        )}
      </div>

      {clipboardError && <p role="alert" className="rcv-warn">No se pudo copiar automáticamente. Mantén pulsada la dirección para copiarla.</p>}
      <p className="rcv-warn">{current.warn}</p>
      {network === "base" && <p className="vd-legal-note">Puedes recibir USDC sin ETH. Para enviarlo después necesitarás ETH en Base para la comisión. Nunca compartas tus claves ni códigos.</p>}
    </div>
  );
}

export function ReceivePanel() {
  if (!authConfigured) return <p className="bal-note">Para recibir debes iniciar sesión en VanDeFi.</p>;
  return <ReceivePanelInner />;
}
