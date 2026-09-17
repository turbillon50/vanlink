import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro } from "@/components/craft";
import { CreateVanLinkForm } from "@/components/vanlink/create-form";

export default function CreatePage() {
  return (
    <AppShell>
      <TopBar title="Nuevo VanLink" backHref="/vanlink" />
      <PageIntro
        eyebrow="COBRAR, ASÍ DE SIMPLE"
        title="Crea tu cobro"
        description="Genera un link. Quien lo abra paga directo a tu wallet."
      />
      <CreateVanLinkForm></CreateVanLinkForm>
    </AppShell>
  );
}
