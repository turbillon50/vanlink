/**
 * components/fiat/BuyWidget.tsx
 * Componente CLIENTE. Solo pinta un iframe con la URL que ya vino armada
 * del server (ver lib/fiat/get-buy-widget-url.ts). No construye la URL
 * aquí — nunca debe tener acceso a ONRAMPER_API_KEY ni a la wallet en
 * crudo más allá de lo que ya viaja dentro de `src`.
 *
 * Uso típico (en un Server Component / page.tsx):
 *
 *   import { getBuyWidgetUrlForUser } from "@/lib/fiat/get-buy-widget-url";
 *   import { BuyWidget } from "@/components/fiat/BuyWidget";
 *
 *   export default async function ComprarPage() {
 *     const userId = await getCurrentUserId(); // el helper que ya uses
 *     const src = await getBuyWidgetUrlForUser(userId);
 *     return <BuyWidget src={src} />;
 *   }
 */
"use client";

export function BuyWidget({ src }: { src: string }) {
  return (
    <iframe
      src={src}
      title="Comprar cripto — Onramper"
      height={630}
      width="100%"
      style={{ border: "none", borderRadius: 12, maxWidth: 464 }}
      allow="accelerometer; autoplay; camera; gyroscope; payment"
    />
  );
}
