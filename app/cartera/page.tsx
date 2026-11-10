import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { WalletPortfolio } from "@/components/wallet/portfolio";

export default function PortfolioPage() {
  return (
    <AppShell wide>
      <TopBar title="Otros activos" backHref="/" />
      <div className="vd-wallet-home">
        <WalletPortfolio />
        <nav className="vd-simple-links" aria-label="Herramientas de activos">
          <Link href="/expert" className="vd-flat-link">Mis tokens en Polygon</Link>
          <Link href="/receive?red=historica" className="vd-flat-link">Direcciones de Base y Bitcoin</Link>
          <Link href="/send?red=historica" className="vd-flat-link">Enviar activos en Base o Bitcoin</Link>
        </nav>
      </div>
    </AppShell>
  );
}
