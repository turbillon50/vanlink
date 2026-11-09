"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro } from "@/components/craft";
import { ActivityList } from "@/components/wallet/activity-list";
import { OperationMonitor } from "@/components/wallet/operation-monitor";
export default function ActivityPage() {
  const [filter, setFilter] = useState("all");
  return (
    <AppShell wide>
      <TopBar brand />
      <PageIntro
        eyebrow="TODO EN ORDEN"
        title="Tu actividad"
        description="Tus movimientos. Claros y a la mano."
      />
      <OperationMonitor />
      <div className="vd-activity-verified-heading"><p className="vd-overline">REGISTROS DE CADENA</p><h2>Historial de movimientos</h2></div>
      <div className="filter-row" aria-label="Filtrar movimientos">
        {[
          ["all", "Todos"],
          ["in", "Entradas"],
          ["out", "Salidas"],
        ].map(([v, l]) => (
          <button
            key={v}
            aria-pressed={v === filter}
            onClick={() => setFilter(v)}
          >
            {l}
          </button>
        ))}
      </div>
      <ActivityList filter={filter as "all" | "in" | "out"} />
    </AppShell>
  );
}
