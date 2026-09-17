import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { MarketPulse } from "@/components/market-pulse";
import { MarketChart } from "@/components/market-chart";

export default function MarketPage() {
  return (
    <AppShell>
      <TopBar title="Mercado" />
      <section className="market-page v-folio">
        <p className="eyebrow">SEÑAL / EN VIVO</p>
        <h2>Lo que mueve<br />tu mundo.</h2>
        <p className="market-lead">Datos de mercado para entender antes de cambiar, enviar o comprar. No es asesoría financiera.</p>
        <MarketChart symbol="BTCUSDT" />

        <MarketPulse />
      </section>
    </AppShell>
  );
}
