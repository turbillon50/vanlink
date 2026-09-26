import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro } from "@/components/craft";
import { LinkCreate } from "@/components/wallet/link-create";

export const metadata = { title: "Link de Bitcoin · VanDeFi" };

export default function LinkPage() {
  return (
    <AppShell>
      <TopBar title="Link de Bitcoin" backHref="/send" />
      <PageIntro eyebrow="POR WHATSAPP" title="Manda Bitcoin con un link" description="La otra persona no necesita cuenta: pega su dirección de Bitcoin y le llega." />
      <LinkCreate />
    </AppShell>
  );
}
