import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro, ConnectionNote } from "@/components/craft";
import { RampNotice } from "@/components/wallet/ramp-notice";

export const metadata = { title: "Down · VanDeFi" };

export default function DownPage() {
  return (
    <AppShell>
      <TopBar title="Down" backHref="/" />
      <PageIntro
        eyebrow="SALE DINERO"
        title="Baja saldo"
        description="Convierte tus activos digitales en dinero a tu cuenta o a tu método local."
      />
      <RampNotice direction="down" />
      <ConnectionNote>
        La disponibilidad de retiro cambia por país y la define el proveedor, no
        nosotros. En varios países la salida más usada sigue siendo P2P.
      </ConnectionNote>
    </AppShell>
  );
}
