import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { SendExperience } from "@/components/wallet/send-experience";

export const metadata = { title: "Enviar · VanDeFi" };

export default function SendPage() {
  return <AppShell><TopBar title="Enviar" backHref="/operate"/><SendExperience/></AppShell>;
}
