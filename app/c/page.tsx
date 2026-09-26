import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro } from "@/components/craft";
import { ClaimLink } from "@/components/wallet/claim-link";

export const metadata = {
  title: "Te enviaron Bitcoin · VanDeFi",
  description: "Abre el link, pega tu dirección de Bitcoin y recíbelo. Sin registrarte.",
  robots: { index: false, follow: false },
};

export default function ClaimPage() {
  return (
    <AppShell>
      <TopBar title="Recibir Bitcoin" backHref="/" />
      <PageIntro eyebrow="LINK DE BITCOIN" title="Te enviaron Bitcoin" description="Pega tu dirección de Bitcoin y te llega directo. Sin cuenta, sin registro." />
      <ClaimLink />
    </AppShell>
  );
}
