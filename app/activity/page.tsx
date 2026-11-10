"use client";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { authConfigured } from "@/lib/auth-config";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PageIntro } from "@/components/craft";
import { ActivityList } from "@/components/wallet/activity-list";
import { OperationMonitor } from "@/components/wallet/operation-monitor";

type ActivityFilter = "all" | "in" | "out";

function ActivityFilters({ filter, onChange }: { filter: ActivityFilter; onChange: (value: ActivityFilter) => void }) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded || !userId) return null;
  return (
    <div className="filter-row" aria-label="Filtrar movimientos">
      {([
        ["all", "Todos"], ["in", "Entradas"], ["out", "Salidas"],
      ] as const).map(([value, label]) => (
        <button key={value} aria-pressed={value === filter} onClick={() => onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  return (
    <AppShell wide>
      <TopBar brand />
      <PageIntro
        eyebrow="MOVIMIENTOS"
        title="Tu actividad"
        description="Tus movimientos. Claros y a la mano."
      />
      <OperationMonitor>
        <section aria-label="Historial de movimientos">
          <div className="vd-activity-verified-heading">
            <p className="vd-overline">TU HISTORIAL</p>
            <h2>Historial de movimientos</h2>
          </div>
          {authConfigured && <ActivityFilters filter={filter} onChange={setFilter} />}
          <ActivityList filter={filter} />
        </section>
      </OperationMonitor>
    </AppShell>
  );
}
