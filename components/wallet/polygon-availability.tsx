import type { PolygonAvailability } from "@/lib/polygon/availability";

export function PolygonAvailabilityNotice({ availability }: { availability: PolygonAvailability }) {
  if (availability === "enabled") return null;
  const heading = availability === "paused"
    ? "Envíos y depósitos en Polygon en pausa"
    : availability === "loading" ? "Comprobando disponibilidad de Polygon…" : "Disponibilidad de Polygon sin comprobar";
  const message = availability === "paused"
    ? "Puedes consultar tu saldo y tus movimientos. Espera a que se habiliten antes de enviar dinero a esta wallet."
    : availability === "loading"
      ? "Espera la confirmación antes de enviar o depositar."
      : "No pudimos confirmar si los envíos y depósitos están habilitados. Por ahora no envíes dinero a esta wallet.";
  return <div className="snd-gate" role="status"><strong>{heading}</strong><p>{message}</p></div>;
}
