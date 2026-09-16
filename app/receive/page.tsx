import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import {
  PageIntro,
  NetworkPill,
  EmptyState,
  ConnectionNote,
} from "@/components/craft";
export default function ReceivePage() {
  return (
    <AppShell>
      <TopBar title="Recibir" backHref="/" />
      <PageIntro
        eyebrow="DIRECTO A TU WALLET"
        title="Recibe en USDC"
        description="Tu dirección y tu QR, en un solo lugar."
      />
      <NetworkPill />
      <EmptyState
        icon="wallet"
        title="Primero, conecta tu wallet"
        description="Cuando esté conectada, aquí aparecerán tu dirección real en Base y su código QR."
        action={<PressButton href="/login">Ver acceso a mi cuenta</PressButton>}
      />
      <ConnectionNote>
        También puedes dejar preparado un VanLink y publicarlo cuando tu wallet
        esté lista.
      </ConnectionNote>
      <PressButton variant="secondary" href="/vanlink/create">
        Preparar un VanLink
      </PressButton>
    </AppShell>
  );
}
