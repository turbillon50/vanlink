import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro } from "@/components/craft";
import { CreateVanLinkForm } from "@/components/vanlink/create-form";

export default function CreatePage() {
  return (
    <AppShell>
      <TopBar title="Nuevo VanLink" backHref="/vanlink" />
      <PageIntro
        eyebrow="VANLINK"
        title="Crea tu cobro"
        description="Elige la red para consultar las opciones de cobro."
      />
      <CreateVanLinkForm></CreateVanLinkForm>
    </AppShell>
  );
}
