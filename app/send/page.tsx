import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { SendIntro } from "@/components/design/send-intro";
import { SendFlow } from "@/components/wallet/send-flow";

export const metadata = { title: "Enviar · VanDeFi" };

export default function SendPage() {
  return (
    <AppShell>
      <TopBar title="Enviar" backHref="/operate" />
      <SendIntro />
      <SendFlow />
    </AppShell>
  );
}
