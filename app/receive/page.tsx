import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro } from "@/components/craft";
import { ReceivePanel } from "@/components/wallet/receive";

export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ red?: string }> }) {
  const historical = (await searchParams).red === "historica";
  return (
    <AppShell>
      <TopBar title="Recibir" backHref="/operate" returnToOrigin />
      <PageIntro
        eyebrow="TU WALLET POR RED"
        title="Recibir en tu wallet"
        description="Consulta la disponibilidad y verifica la red antes de compartir una dirección."
      />
      <ReceivePanel historical={historical} />
    </AppShell>
  );
}
