"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import { Icon, type IconName } from "@/components/icons";
import { NetworkPill, EmptyState } from "@/components/craft";
import { CryptoMark } from "@/components/brand/crypto-mark";
import { LinkSculpture } from "@/components/brand/link-sculpture";
const actions: { label: string; href: string; icon: IconName }[] = [
  { label: "Enviar", href: "/send", icon: "up" },
  { label: "Recibir", href: "/receive", icon: "down" },
  { label: "Cambiar", href: "/swap", icon: "swap" },
  { label: "Comprar", href: "/buy", icon: "plus" },
];
export default function HomePage() {
  const [hidden, setHidden] = useState(false);
  return (
    <AppShell wide>
      <TopBar brand />
      <div className="home-heading">
        <div>
          <p className="eyebrow">Bienvenido a tu wallet</p>
          <h1>
            Tu dinero.
            <br className="mobile-only" /> Más simple.
          </h1>
        </div>
        <NetworkPill />
      </div>
      <div className="home-grid">
        <section className="balance-panel">
          <div className="section-heading">
            <p className="muted">Balance disponible</p>
            <button
              className="icon-button quiet"
              onClick={() => setHidden(!hidden)}
              aria-pressed={hidden}
              aria-label={hidden ? "Mostrar balance" : "Ocultar balance"}
            >
              <Icon name="eye" size={19} />
            </button>
          </div>
          <div className="balance-value">
            {hidden ? "••••" : "—"}
            <span>USDC</span>
          </div>
          <p className="balance-caption">
            Conecta tu wallet para consultar tu saldo.
          </p>
          <div className="quick-actions">
            {actions.map((a) => (
              <Link href={a.href} key={a.label}>
                <span>
                  <Icon name={a.icon} size={24} />
                </span>
                <strong>{a.label}</strong>
              </Link>
            ))}
          </div>
          <div className="asset-row">
            <CryptoMark asset="USDC" size={40} />
            <div>
              <strong>USD Coin</strong>
              <small>USDC · Base</small>
            </div>
            <strong className="muted">—</strong>
          </div>
        </section>
        <section className="vanlink-hero">
          <span className="hero-shine" aria-hidden="true" />
          <div className="section-heading">
            <span className="eyebrow">VANLINK</span>
            <LinkSculpture />
          </div>
          <h2>
            Un link.
            <br />Y listo.
          </h2>
          <p>
            Prepara tu cobro.
            <br />
            Compártelo cuando tu wallet esté lista.
          </p>
          <PressButton href="/vanlink/create">
            Preparar un VanLink <Icon name="arrow" size={18} />
          </PressButton>
          <span className="hero-footnote">
            Simple de crear. Fácil de compartir.
          </span>
        </section>
        <section className="activity-panel">
          <div className="section-heading">
            <h2>Tu actividad</h2>
            <Link className="text-link" href="/activity">
              Ver todo <Icon name="chevron" size={14} />
            </Link>
          </div>
          <EmptyState
            icon="activity"
            title="Aquí empieza tu historia"
            description="Tus envíos y cobros aparecerán aquí cuando conectes tu wallet."
          />
        </section>
        <section className="start-panel">
          <span className="small-orb">
            <Icon name="wallet" size={21} />
          </span>
          <div>
            <h2>Hazla tuya</h2>
            <p>Una cuenta. Una wallet. Todo a la mano.</p>
            <Link href="/login" className="text-link">
              Ver acceso a mi cuenta <Icon name="arrow" size={16} />
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
