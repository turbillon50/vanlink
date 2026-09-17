"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";
import { MarketPulse } from "@/components/market-pulse";
import { WalletBalances } from "@/components/wallet/balances";

const actions = [
  { label: "Enviar", href: "/send", icon: "up" as const },
  { label: "Recibir", href: "/receive", icon: "down" as const },
  { label: "Cambiar", href: "/swap", icon: "swap" as const },
  { label: "Comprar", href: "/buy", icon: "plus" as const },
];

export default function HomePage() {
  const [hidden, setHidden] = useState(false);
  return (
    <AppShell wide>
      <TopBar brand />
      <section className="van-home v-folio">
        <div className="van-home-intro">
          <div>
            <p className="eyebrow">TU ESPACIO FINANCIERO</p>
            <h1>Muévete<br /><span>con ventaja.</span></h1>
          </div>
          <Link href="/v" className="v-corner" aria-label="Abrir asistente de VanDeFi"><Icon name="chat" size={26} /><small>AYUDA</small></Link>
        </div>

        <div className="van-balance">
          <div className="balance-topline">
            <span>VALOR DE TU WALLET</span>
            <button type="button" onClick={() => setHidden((value) => !value)} aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}>
              <Icon name="eye" size={17} />
            </button>
          </div>
          <WalletBalances hidden={hidden} />
          <span className="balance-rim" aria-hidden="true" />
        </div>

        <div className="van-actions" aria-label="Acciones rápidas">
          {actions.map(({ label, href, icon }) => (
            <Link href={href} key={label}>
              <span><Icon name={icon} size={21} /></span>
              <small>{label}</small>
            </Link>
          ))}
        </div>

        <section className="vanlink-command">
          <div className="vanlink-threads" aria-hidden="true"><i /><i /><i /></div>
          <div className="vanlink-copy">
            <p className="eyebrow">VANLINK / REMESAS</p>
            <h2>Envía un link.<br /><span>La otra persona cobra.</span></h2>
            <p>Prepara una ruta, compártela y deja que el receptor complete sus datos para recibir localmente.</p>
          </div>
          <Link href="/vanlink/create" className="vanlink-action">Crear VanLink <Icon name="arrow" size={17} /></Link>
        </section>

        <section className="van-market-section">
          <div className="market-heading"><div><p className="eyebrow">MERCADO</p><h2>Pulso vivo.</h2></div><Link href="/market">Ver mercado <Icon name="arrow" size={14} /></Link></div>
          <MarketPulse compact />
        </section>

        <Link href="/v" className="v-assistant-card">
          <div className="v-assistant-mark"><Icon name="chat" size={26} /></div>
          <div><p className="eyebrow">ASISTENTE</p><h2>¿Qué quieres hacer?</h2><p>Te ayuda a entender rutas, activos y tus siguientes pasos.</p></div>
          <Icon name="arrow" size={18} />
        </Link>
      </section>
    </AppShell>
  );
}
