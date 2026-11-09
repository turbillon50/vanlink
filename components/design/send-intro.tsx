"use client";
import { PageIntro } from "@/components/craft";
import { useWalletMode } from "@/components/mode/wallet-mode";

export function SendIntro() {
  const { mode } = useWalletMode();
  return mode === "expert" ? (
    <PageIntro
      eyebrow="TRANSFERENCIAS · BITCOIN / BASE"
      title="Enviar activos"
      description="Selecciona red y activo. Verás una cotización de comisión, revisión y firma desde tu dispositivo."
    />
  ) : (
    <PageIntro
      eyebrow="TRANSFERENCIAS"
      title="Enviar dinero"
      description="Elige tu activo, escribe el destino y revisa el importe y el costo antes de confirmar."
    />
  );
}
