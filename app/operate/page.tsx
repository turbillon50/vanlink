"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";
import { usePolygonAvailability } from "@/lib/polygon/use-availability";
import { PolygonAvailabilityNotice } from "@/components/wallet/polygon-availability";
import { USDTOperationBar } from "@/components/design/usdc-operations";

export default function OperatePage() {
  const availability = usePolygonAvailability();

  return (
    <AppShell wide>
      <TopBar title="Operar" />
      <div className="vd-operate-screen">
        <header className="vd-operate-head">
          <h1>Operaciones</h1>
        </header>
        <PolygonAvailabilityNotice availability={availability} />
        {availability === "enabled" && <USDTOperationBar />}

        <section className="vd-utility-list" aria-label="Más formas de mover dinero">
          <Link href="/receive" className="vd-utility-row">
            <span className="vd-utility-icon"><Icon name="wallet" size={23}/></span>
            <span><strong>{availability === "enabled" ? "Recibir USDT" : "Estado de Polygon"}</strong><small>{availability === "enabled" ? "Dirección y código QR" : "Disponibilidad de envíos y depósitos"}</small></span>
            <Icon name="chevron" size={18}/>
          </Link>
          <Link href="/vanlink" className="vd-utility-row">
            <span className="vd-utility-icon"><Icon name="link" size={23}/></span>
            <span><strong>Mis VanLinks</strong><small>Ligas de cobro y borradores</small></span>
            <Icon name="chevron" size={18}/>
          </Link>
          <Link href="/activity" className="vd-utility-row">
            <span className="vd-utility-icon"><Icon name="activity" size={23}/></span>
            <span><strong>Movimientos</strong><small>Historial y comprobantes</small></span>
            <Icon name="chevron" size={18}/>
          </Link>
        </section>

        <section className="vd-expert-section" aria-label="Herramientas de análisis">
          <div className="vd-expert-head">
            <h2>Herramientas</h2>
          </div>
          <Link href="/expert" className="vd-utility-row">
            <span className="vd-utility-icon"><Icon name="wallet" size={23}/></span>
            <span><strong>Mis tokens</strong><small>Configura tu tablero ERC-20 en Polygon</small></span>
            <Icon name="chevron" size={18}/>
          </Link>
          <Link href="/market" className="vd-utility-row">
            <span className="vd-utility-icon"><Icon name="chart" size={23}/></span>
            <span><strong>Mercado y precios</strong><small>Gráficas y cotizaciones disponibles</small></span>
            <Icon name="chevron" size={18}/>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
