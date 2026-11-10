"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";
import { SimpleUSDTWallet } from "@/components/wallet/simple-usdc";
import { usePolygonAvailability } from "@/lib/polygon/use-availability";

export default function HomePage() {
  const availability = usePolygonAvailability();
  return (
    <AppShell wide>
      <TopBar brand />
      <div className="vd-wallet-home">
        <header className="vd-wallet-heading"><h1>Mi cartera</h1></header>
        <SimpleUSDTWallet availability={availability} />
        <section className="vd-simple-links" aria-label="Accesos de la cartera">
          <Link href="/profile" className="vd-flat-link">
            <span className="vd-flat-icon"><Icon name="shield" size={21} /></span>
            <span><strong>Acceso a mi wallet</strong><small>Revisa este dispositivo y tus opciones de recuperación</small></span>
            <Icon name="chevron" size={16} />
          </Link>
          <Link href="/vanlink" className="vd-flat-link">
            <span className="vd-flat-icon"><Icon name="link" size={21} /></span>
            <span><strong>Mis VanLinks</strong><small>Solicitudes de cobro y borradores</small></span>
            <Icon name="chevron" size={16} />
          </Link>
          <Link href="/v" className="vd-flat-link">
            <span className="vd-flat-icon"><Icon name="chat" size={21} /></span>
            <span><strong>Asistente VanDeFi</strong><small>Ayuda con tu cuenta y tus movimientos</small></span>
            <Icon name="chevron" size={16} />
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
