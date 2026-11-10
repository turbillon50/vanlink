"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { authConfigured } from "@/lib/auth-config";
import type { PolygonAvailability } from "@/lib/polygon/availability";
import { PolygonAvailabilityNotice } from "@/components/wallet/polygon-availability";
import { Wordmark } from "@/components/brand/logo";
import { Icon } from "@/components/icons";
import { useWalletMode } from "@/components/mode/wallet-mode";
import { USDTOperationBar } from "@/components/design/usdc-operations";

type ViewState = "loading" | "ready" | "guest" | "no-wallet" | "error";
type PolygonBalance = {
  wallet: { evmAddress: string } | null;
  polygon?: { network: string; token: string; contract: string; amount: string; polGasBalance: string; observedAt: string };
};

function formatUSDT(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return "—";
  return new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2 }).format(value);
}

export function SimpleUSDTWallet({ availability }: { availability: PolygonAvailability }) {
  if (!authConfigured) return <SimpleUSDTWalletForUser key="guest" userId={null} isLoaded availability={availability} />;
  return <AuthenticatedSimpleUSDTWallet availability={availability} />;
}

function AuthenticatedSimpleUSDTWallet({ availability }: { availability: PolygonAvailability }) {
  const { userId, isLoaded } = useAuth();
  // Remount synchronously on an identity change; no previous balance can flash.
  return <SimpleUSDTWalletForUser key={isLoaded ? userId || "guest" : "loading"}
    userId={userId || null} isLoaded={isLoaded} availability={availability} />;
}

function SimpleUSDTWalletForUser({ availability, userId, isLoaded }: {
  availability: PolygonAvailability; userId: string | null; isLoaded: boolean;
}) {
  const { setMode } = useWalletMode();
  const [state, setState] = useState<ViewState>(isLoaded && !userId ? "guest" : "loading");
  const [data, setData] = useState<PolygonBalance | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setData(null);
    if (!isLoaded) { setState("loading"); return; }
    if (!userId) { setState("guest"); return; }
    setState("loading");
    let live = true;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/chain/polygon", { cache: "no-store", signal: controller.signal });
        if (!live) return;
        if (response.status === 401) { setData(null); setState("guest"); return; }
        if (!response.ok) throw new Error("unavailable");
        const body = await response.json() as PolygonBalance;
        if (!live) return;
        setData(body);
        setState(body.wallet ? "ready" : "no-wallet");
      } catch {
        if (live) { setState("error"); setData(null); }
      }
    };
    void refresh();
    const onReady = () => { void refresh(); };
    window.addEventListener("vandefi:wallet-ready", onReady);
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { live = false; controller.abort(); clearInterval(interval); window.removeEventListener("vandefi:wallet-ready", onReady); };
  }, [userId, isLoaded]);

  const ready = state === "ready" && data?.polygon?.token === "USDT";
  const quantity = data?.polygon?.amount ?? "";
  const message =
    state === "loading" ? "Leyendo saldo en Polygon…"
      : state === "guest" ? "Inicia sesión para consultar tu USDT."
      : state === "no-wallet" ? "Tu cuenta todavía no tiene una wallet. Consulta su estado en Cuenta."
      : state === "error" ? "No pudimos comprobar tu saldo. No mostraremos un cero falso."
      : "USDT de Tether · Polygon PoS. Valor en USD aproximado.";


  return (
    <>
      <PolygonAvailabilityNotice availability={availability} />
      <section className="vd-total-card vd-simple-usdc-card" aria-label="USDT real en Polygon">
        <div className="vd-total-top">
          <Wordmark size={19}/>
          <button type="button" className="vd-total-eye" aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
            aria-pressed={hidden} onClick={() => setHidden((value) => !value)}>
            <Icon name="eye" size={19}/>
          </button>
        </div>
        <div className="vd-total-body">
          <p className="vd-total-label">MI SALDO DISPONIBLE</p>
          <div className="vd-total-figure" aria-live="polite">
            <strong>{hidden ? "••••" : ready ? formatUSDT(quantity) : "—"}</strong>
            <span>USDT</span>
          </div>
          {ready && (
            <div className="vd-total-equivalents">
              <span>{hidden ? "≈ •••• USD" : `≈ $${formatUSDT(quantity)} USD`}</span>
              <span className="vd-network-chip">Polygon PoS</span>
            </div>
          )}
        </div>
        <div className="vd-total-footer">
          <p role={state === "error" ? "status" : undefined}>{message}</p>
          <span className="vd-total-stamp">VANDEFI · USDT</span>
        </div>
        {state === "guest" && <Link href="/login" className="vd-portfolio-gate">Entrar a mi cuenta <Icon name="chevron" size={15}/></Link>}
        {state === "no-wallet" && <Link href="/profile" className="vd-portfolio-gate">Ver mi cuenta <Icon name="chevron" size={15}/></Link>}
      </section>

      {availability === "enabled" && <USDTOperationBar />}
      <div className="vd-simple-information">
        <div>
          <p className="vd-overline">UN DÓLAR DIGITAL</p>
          <h2>{availability === "enabled" ? "Compra. Envía. Retira." : "Consulta tu wallet"}</h2>
          <p>{availability === "enabled" ? "Sin elegir tokens o cadenas. VanDeFi muestra los costos y la red antes de confirmar." : "Tu saldo y tus movimientos siguen disponibles para consulta."}</p>
        </div>
        <Link href={availability === "enabled" ? "/receive" : "/activity"} className="vd-small-outline">{availability === "enabled" ? "Recibir USDT" : "Ver actividad"} <Icon name="arrow" size={15}/></Link>
      </div>
      {availability === "enabled" && ready && Number(data!.polygon!.polGasBalance) === 0 && (
        <p className="vd-gas-disclaimer">Para enviar USDT en Polygon se necesita POL para la comisión. El patrocinio automático de gas todavía no está habilitado.</p>
      )}
      <button type="button" className="vd-other-assets-link" onClick={() => setMode("expert")}>
        Tengo otros activos o quiero configurar más tokens <Icon name="chevron" size={16}/>
      </button>
    </>
  );
}
