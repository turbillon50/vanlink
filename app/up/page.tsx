import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro, ConnectionNote } from "@/components/craft";
import { RampNotice } from "@/components/wallet/ramp-notice";

export const metadata = { title: "Up · VanDeFi" };

export default function UpPage() {
  return (
    <AppShell>
      <TopBar title="Up" backHref="/" />
      <PageIntro
        eyebrow="ENTRA DINERO"
        title="Sube saldo"
        description="Convierte pesos, euros o dólares en activos digitales dentro de tu wallet."
      />
      <RampNotice direction="up" />
      <ConnectionNote>
        La compra la procesa un proveedor externo con sus propias comisiones y
        requisitos de verificación. VanDeFi no toca tu dinero en ese paso.
      </ConnectionNote>
    </AppShell>
  );
}
