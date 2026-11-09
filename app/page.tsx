"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";
import { WalletPortfolio } from "@/components/wallet/portfolio";
import { MarketPulse } from "@/components/market-pulse";
import { ModeToggle, useWalletMode } from "@/components/mode/wallet-mode";

export default function HomePage() {
  const { mode } = useWalletMode();

  return (
    <AppShell wide>
      <TopBar brand />
      <div className="vd-wallet-home">
        <header className="vd-wallet-heading">
          <div className="vd-heading-row">
            <div>
              <p className="vd-overline">MI WALLET</p>
              <h1>{mode === "simple" ? "Mi dinero" : "Mi cartera"}</h1>
            </div>
            <ModeToggle compact />
          </div>
          {mode === "expert" && (
            <p className="vd-expert-caption">
              Bitcoin y activos por red. Cotizaciones, firmas y costos se verifican en cada operación.
            </p>
          )}
        </header>

        <WalletPortfolio />

        <section className="vd-feature-link" aria-label="VanLink">
          <div className="vd-feature-copy">
            <p className="vd-overline">VANLINK / PAGOS POR WHATSAPP</p>
            <h2>Un enlace.<br/>Muchas posibilidades.</h2>
            <p>Prepara tu solicitud de cobro y compártela cuando el enlace esté habilitado.</p>
          </div>
          <Link href="/vanlink/create" className="vd-feature-action">
            Preparar VanLink <Icon name="arrow" size={16}/>
          </Link>
          <span className="vd-feature-lines" aria-hidden="true" />
        </section>

        {mode === "simple" ? (
          <section className="vd-simple-links" aria-label="Accesos rápidos">
            <Link href="/receive" className="vd-flat-link">
              <span className="vd-flat-icon"><Icon name="wallet" size={21}/></span>
              <span><strong>Mi código para recibir</strong><small>Dirección y QR de la wallet</small></span>
              <Icon name="chevron" size={16}/>
            </Link>
            <Link href="/v" className="vd-flat-link">
              <span className="vd-flat-icon"><Icon name="chat" size={21}/></span>
              <span><strong>¿Necesitas ayuda?</strong><small>Asistente VanDeFi</small></span>
              <Icon name="chevron" size={16}/>
            </Link>
          </section>
        ) : (
          <section className="vd-expert-home" aria-label="Información avanzada">
            <div className="vd-expert-heading">
              <div>
                <p className="vd-overline">MERCADOS</p>
                <h2>Información de mercado</h2>
              </div>
              <Link href="/market" className="vd-minor-link">Ver más <Icon name="chevron" size={16}/></Link>
            </div>
            <MarketPulse compact />
            <Link href="/operate" className="vd-flat-link">
              <span className="vd-flat-icon"><Icon name="swap" size={21}/></span>
              <span><strong>Herramientas de operación</strong><small>Enviar, recibir, convertir, redes y costos</small></span>
              <Icon name="chevron" size={16}/>
            </Link>
          </section>
        )}
      </div>
    </AppShell>
  );
}
