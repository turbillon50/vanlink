"use client";

import { SendFlow } from "@/components/wallet/send-flow";
import { SendPolygonUSDT } from "@/components/wallet/send-polygon";
import { PageIntro } from "@/components/craft";

export function SendExperience({ historical }: { historical: boolean }) {
  if (!historical) return (
    <>
      <PageIntro eyebrow="USDT · POLYGON" title="Enviar dinero"
        description="Consulta la disponibilidad de USDT en Polygon antes de preparar un envío." />
      <SendPolygonUSDT/>
    </>
  );
  return (
    <>
      <PageIntro eyebrow="BASE · BITCOIN" title="Enviar activos"
        description="Consulta la red, selecciona el activo y revisa las comisiones antes de firmar." />
      <SendFlow/>
    </>
  );
}
