/**
 * components/fiat/SellGate.tsx
 * Server Component. Punto de entrada de la pantalla de off-ramp: verifica
 * contra la API de Onramper (no asume nada) si la cuenta tiene sell
 * habilitado para USDT/BTC antes de renderizar cualquier UI de venta.
 *
 * Uso:
 *   import { SellGate } from "@/components/fiat/SellGate";
 *   export default function VenderPage() {
 *     return <SellGate>{/* aquí tu widget de venta real *\/}</SellGate>;
 *   }
 */
import { checkOfframpAvailability } from "@/lib/fiat/onramper";

export async function SellGate({ children }: { children: React.ReactNode }) {
  const check = await checkOfframpAvailability();

  if (!check.available) {
    // Reportado, no montado — exactamente lo pedido: si no está
    // habilitado, no se construye la pantalla.
    console.warn("[fiat/off-ramp] No disponible:", check.reason);
    return (
      <div role="status" style={{ padding: 16, opacity: 0.8 }}>
        La venta de cripto por este medio no está disponible todavía para tu
        cuenta.
      </div>
    );
  }

  return <>{children}</>;
}
