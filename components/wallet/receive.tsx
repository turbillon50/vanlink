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

type Wallet = { evmAddress: string; bitcoinAddress: string };

const NETWORKS = [
  { id: "base", label: "Base", hint: "USDC, USDT y tokens de Base", warn: "Solo envía activos de la red Base. Otra red implica pérdida total." },
  { id: "bitcoin", label: "Bitcoin", hint: "BTC en la red Bitcoin", warn: "Solo envía BTC de la red Bitcoin. No envíes desde otra red." },
] as const;

function chunk(address: string) {
  return address.replace(/(.{4})/g, "$1 ").trim();
}

function ReceivePanelInner() {
  const { userId, isLoaded } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [state, setState] = useState<"cargando" | "listo" | "sin-sesion" | "sin-wallet" | "error">("cargando");
  const [network, setNetwork] = useState<"base" | "bitcoin">("base");
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [clipboardError, setClipboardError] = useState(false);
  const [walletVersion, setWalletVersion] = useState(0);

  useEffect(() => {
    const ready = () => setWalletVersion((n) => n + 1);
    window.addEventListener("vandefi:wallet-ready", ready);
    return () => window.removeEventListener("vandefi:wallet-ready", ready);
  }, []);

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

  const address = useMemo(() => {
    if (!wallet) return "";
    return network === "base" ? wallet.evmAddress : wallet.bitcoinAddress;
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

  return (
    <div className="rcv">
      <div className="rcv-tabs" role="tablist" aria-label="Red">
        {NETWORKS.map((n) => (
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
