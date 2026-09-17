"use client";

/**
 * components/wallet/ramp-notice.tsx
 * Estado real de las rampas Up/Down. Consulta al servidor si el proveedor
 * está disponible; si no lo está, lo dice en lugar de mostrar un botón muerto.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

export function RampNotice({ direction }: { direction: "up" | "down" }) {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = await fetch(`/api/onramp/status?direction=${direction}`, { cache: "no-store" });
        const d = (await r.json()) as { available?: boolean };
        if (active) setReady(Boolean(d.available));
      } catch {
        if (active) setReady(false);
      }
    })();
    return () => { active = false; };
  }, [direction]);

  if (ready === null) return <div className="ramp-skeleton" aria-label="Consultando" />;

  if (!ready) {
    return (
      <div className="ramp-box">
        <span className={direction === "up" ? "ramp-orb up" : "ramp-orb down"} aria-hidden="true">
          <Icon name={direction === "up" ? "up" : "down"} size={22} />
        </span>
        <strong>{direction === "up" ? "Aún no puedes subir saldo" : "Aún no puedes bajar saldo"}</strong>
        <p>
          Estamos terminando de habilitar al proveedor. Mientras tanto puedes recibir
          fondos directo a tu dirección desde la pantalla de Recibir.
        </p>
      </div>
    );
  }

  return (
    <div className="ramp-box ramp-ready">
      <span className={direction === "up" ? "ramp-orb up" : "ramp-orb down"} aria-hidden="true">
        <Icon name={direction === "up" ? "up" : "down"} size={22} />
      </span>
      <strong>{direction === "up" ? "Listo para subir saldo" : "Listo para bajar saldo"}</strong>
      <p>Continúa con el proveedor para completar la operación.</p>
    </div>
  );
}
