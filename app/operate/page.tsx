"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";
import { OperationBar } from "@/components/design/operation-bar";
import { ModeToggle, useWalletMode } from "@/components/mode/wallet-mode";

export default function OperatePage() {
  const { mode } = useWalletMode();

  return (
    <AppShell wide>
      <TopBar title="Operar" />
      <div className="vd-operate-screen">
        <header className="vd-operate-head">
          <p className="vd-overline">TUS OPERACIONES</p>
          <h1>{mode === "simple" ? "¿Qué quieres hacer?" : "Centro de operaciones."}</h1>
          <p>Elige una operación. Verás montos, comisiones y la red antes de confirmar un movimiento.</p>
          <ModeToggle />
        </header>

        <OperationBar />

        <section className="vd-utility-list" aria-label="Más formas de mover dinero">
          <Link href="/receive" className="vd-utility-row">
            <span className="vd-utility-icon"><Icon name="wallet" size={23}/></span>
            <span><strong>Recibir con QR</strong><small>Tu dirección y tu código por red</small></span>
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

        {mode === "expert" && (
          <section className="vd-expert-section" aria-label="Herramientas de análisis">
            <div className="vd-expert-head">
              <p className="vd-overline">HERRAMIENTAS</p>
              <h2>Datos para decidir.</h2>
            </div>
            <Link href="/market" className="vd-utility-row">
              <span className="vd-utility-icon"><Icon name="chart" size={23}/></span>
              <span><strong>Mercado y precios</strong><small>Gráficas y cotizaciones disponibles</small></span>
              <Icon name="chevron" size={18}/>
            </Link>
            <p className="vd-legal-note">
              El modo Experto cambia la información visible, no tus permisos.
              Las redes, comisiones y firmas siempre se confirman en la operación.
            </p>
          </section>
        )}
        <p className="vd-legal-note">
          Algunas compras, retiros y conversiones dependen de proveedores externos.
          Si una cotización no está habilitada, VanDeFi lo indicará antes de mover fondos.
        </p>
      </div>
    </AppShell>
  );
}
