import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro } from "@/components/craft";
import { ReceivePanel } from "@/components/wallet/receive";

export default function ReceivePage() {
  return (
    <AppShell>
      <TopBar title="Recibir" backHref="/" />
      <PageIntro
        eyebrow="DIRECTO A TU WALLET"
        title="Recibe sin vueltas"
        description="Tu dirección y tu QR, por red. Verifica siempre la red antes de enviar."
      />
      <ReceivePanel />
    </AppShell>
  );
}
