import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { MarketPulse } from "@/components/market-pulse";

export default function MarketPage() {
  return (
    <AppShell>
      <TopBar title="Mercado" />
      <section className="market-page v-folio">
        <p className="eyebrow">SEÑAL / EN VIVO</p>
        <h2>Lo que mueve<br />tu mundo.</h2>
        <p className="market-lead">Datos de mercado para entender antes de cambiar, enviar o comprar. No es asesoría financiera.</p>
        <div className="market-chart" aria-label="Pulso del mercado">
          <span className="chart-mesh" />
          <svg viewBox="0 0 330 126" role="img" aria-label="Gráfica de tendencia de mercado">
            <path className="chart-area" d="M0 101 C21 96 31 73 49 79 C66 85 75 52 94 61 C112 70 124 44 143 53 C163 63 176 33 196 43 C218 54 224 23 244 31 C266 40 276 14 296 22 C311 27 320 13 330 8 V126 H0Z" />
            <path className="chart-line" d="M0 101 C21 96 31 73 49 79 C66 85 75 52 94 61 C112 70 124 44 143 53 C163 63 176 33 196 43 C218 54 224 23 244 31 C266 40 276 14 296 22 C311 27 320 13 330 8" />
          </svg>
          <div className="chart-meta"><span>24 H</span><span>SEÑAL DE MERCADO</span></div>
        </div>
        <MarketPulse />
      </section>
    </AppShell>
  );
}
