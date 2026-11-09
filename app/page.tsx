"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";
import { FinGlass, FinQuickAction, FinSectionHeading } from "@/components/design/vliving-finance";
import { MarketPulse } from "@/components/market-pulse";
import { WalletBalances } from "@/components/wallet/balances";

// Primera migración visual desde el sistema VLiving.
// Mantiene las rutas, la wallet real y todos los componentes de negocio.
const actions = [
  { label: "Ingresar", href: "/up", icon: "up" as const },
  { label: "Retirar", href: "/down", icon: "down" as const },
  { label: "Enviar", href: "/send", icon: "send" as const },
  { label: "Recibir", href: "/receive", icon: "wallet" as const },
  { label: "Cambiar", href: "/swap", icon: "swap" as const },
];

export default function HomePage() {
  const [hidden, setHidden] = useState(false);
  return (
    <AppShell wide>
      <TopBar brand />
      <div className="vd-home">
        <header className="vd-intro">
          <div>
            <p className="vd-overline">VANDEFI · TU ESPACIO FINANCIERO</p>
            <h1>Tu dinero.<br /><em>Sin fronteras.</em></h1>
            <p>Recibe, envía y mueve tus activos desde un solo lugar.</p>
          </div>
          <Link href="/v" className="vd-assist-launch" aria-label="Abrir asistente VanDeFi">
            <Icon name="chat" size={20} />
            <small>AYUDA</small>
          </Link>
        </header>

        <FinGlass as="section" className="vd-balance">
          <div className="vd-balance-top">
            <span>TUS ACTIVOS</span>
            <button
              type="button"
              className="vd-balance-visibility"
              onClick={() => setHidden((v) => !v)}
              aria-label={hidden ? "Mostrar saldos" : "Ocultar saldos"}
              aria-pressed={hidden}
            >
              <Icon name="eye" size={17} />
            </button>
          </div>
          <WalletBalances hidden={hidden} />
          <p className="vd-balance-note">
            Los activos muestran su red real en el detalle. Verifica siempre
            la red antes de enviar.
          </p>
        </FinGlass>

        <nav className="vd-shortcuts" aria-label="Acciones con tu dinero">
          {actions.map((a) => (
            <FinQuickAction key={a.href} href={a.href} label={a.label} icon={a.icon} />
          ))}
        </nav>

        <FinGlass as="section" className="vd-send-feature">
          <div>
            <p className="vd-overline">VANLINK · ENVÍOS Y REMESAS</p>
            <h2>Envía una liga.<br /><em>El dinero llega.</em></h2>
            <p>
              Comparte un link de pago por WhatsApp y permite que la otra
              persona siga el proceso de cobro.
            </p>
          </div>
          <Link href="/vanlink/create" className="vd-primary-action">
            Crear VanLink <Icon name="arrow" size={17} />
          </Link>
        </FinGlass>

        <div className="vd-split">
          <FinGlass as="section" className="vd-market">
            <FinSectionHeading eyebrow="ACTIVOS DIGITALES" title="Pulso del mercado." href="/market" linkLabel="Ver mercado" />
            <MarketPulse compact />
          </FinGlass>
          <Link href="/receive" className="vd-glass vd-receive">
            <span className="vd-receive-mark"><Icon name="wallet" size={25} /></span>
            <div>
              <h3>Cobra desde tu celular.</h3>
              <p>Comparte tu dirección o QR para recibir activos.</p>
            </div>
            <span className="vd-arrow"><Icon name="arrow" size={17}/></span>
          </Link>
        </div>

        <Link href="/v" className="vd-glass vd-assistant">
          <span className="vd-assistant-symbol"><Icon name="chat" size={23}/></span>
          <div>
            <p className="vd-overline">ASISTENTE VANDEFI</p>
            <h3>¿En qué te ayudo?</h3>
            <p>Rutas, redes y movimientos, explicados con claridad.</p>
          </div>
          <Icon name="arrow" size={18} />
        </Link>
      </div>
    </AppShell>
  );
}
