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
import QRCode from "qrcode";

type Wallet = { evmAddress: string; bitcoinAddress: string };

const NETWORKS = [
  { id: "base", label: "Base", hint: "USDC, USDT y tokens de Base", warn: "Solo envía activos de la red Base. Otra red implica pérdida total." },
  { id: "bitcoin", label: "Bitcoin", hint: "BTC en la red Bitcoin", warn: "Solo envía BTC de la red Bitcoin. No envíes desde otra red." },
] as const;

function chunk(address: string) {
  return address.replace(/(.{4})/g, "$1 ").trim();
}

export function ReceivePanel() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [state, setState] = useState<"cargando" | "listo" | "sin-wallet" | "error">("cargando");
  const [network, setNetwork] = useState<"base" | "bitcoin">("base");
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/chain/balance", { cache: "no-store" });
        if (r.status === 401) { setState("sin-wallet"); return; }
        if (!r.ok) throw new Error("wallet");
        const data = (await r.json()) as { wallet: Wallet | null };
        if (!data.wallet) { setState("sin-wallet"); return; }
        setWallet(data.wallet);
        setState("listo");
      } catch { setState("error"); }
    })();
  }, []);

  const address = useMemo(() => {
    if (!wallet) return "";
    return network === "base" ? wallet.evmAddress : wallet.bitcoinAddress;
  }, [wallet, network]);

  useEffect(() => {
    if (!address) { setQr(""); return; }
    let active = true;
    void QRCode.toDataURL(address, {
      margin: 1,
      width: 512,
      errorCorrectionLevel: "M",
      color: { dark: "#f7fbff", light: "#00000000" },
    }).then((url) => { if (active) setQr(url); }).catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [address]);

  if (state === "cargando") return <div className="rcv-skeleton" aria-label="Cargando" />;
  if (state === "sin-wallet") {
    return <p className="bal-note">Activa tu wallet para recibir fondos.</p>;
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
            onClick={() => { setNetwork(n.id); setCopied(false); }}
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
            }).catch(() => undefined);
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

      <p className="rcv-warn">{current.warn}</p>
    </div>
  );
}
