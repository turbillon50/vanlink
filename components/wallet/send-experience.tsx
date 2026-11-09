"use client";

import { useWalletMode } from "@/components/mode/wallet-mode";
import { SendFlow } from "@/components/wallet/send-flow";
import { SendPolygonUSDT } from "@/components/wallet/send-polygon";
import { PageIntro } from "@/components/craft";

export function SendExperience() {
  const { mode } = useWalletMode();
  if (mode === "simple") return (
    <>
      <PageIntro eyebrow="USDT · POLYGON" title="Enviar dinero"
        description="Escribe cuánto y a quién. Revisa la comisión y confirma desde tu dispositivo." />
      <SendPolygonUSDT/>
    </>
  );
  return (
    <>
      <PageIntro eyebrow="HERRAMIENTAS EXPERTAS" title="Enviar activos"
        description="Consulta la red, selecciona el activo y revisa las comisiones antes de firmar." />
      <SendFlow/>
    </>
  );
}
