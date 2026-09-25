import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro } from "@/components/craft";
import { SendFlow } from "@/components/wallet/send-flow";

export const metadata = { title: "Enviar · VanDeFi" };

export default function SendPage() {
  return (
    <AppShell>
      <TopBar title="Enviar" backHref="/" />
      <PageIntro
        eyebrow="BITCOIN Y BASE"
        title="Envía directo, sin intermediarios"
        description="Cotizamos la comisión real de la red, tú revisas y firmas desde tu dispositivo."
      />
      <SendFlow />
    </AppShell>
  );
}
