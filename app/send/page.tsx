import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { SendExperience } from "@/components/wallet/send-experience";

export const metadata = { title: "Enviar · VanDeFi" };

export default async function SendPage({ searchParams }: { searchParams: Promise<{ red?: string }> }) {
  const historical = (await searchParams).red === "historica";
  return <AppShell><TopBar title="Enviar" backHref="/operate" returnToOrigin /><SendExperience historical={historical}/></AppShell>;
}
