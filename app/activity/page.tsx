"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro, EmptyState, ConnectionNote } from "@/components/craft";
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
      <EmptyState
        icon="activity"
        title={
          filter === "all"
            ? "Todavía no hay movimientos"
            : filter === "in"
              ? "Aún no hay entradas"
              : "Aún no hay salidas"
        }
        description="Cuando conectes tu wallet, podrás consultar aquí tus movimientos y el detalle de cada operación."
      />
      <ConnectionNote />
    </AppShell>
  );
}
