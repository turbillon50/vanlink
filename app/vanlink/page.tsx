"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import { PageIntro, EmptyState, ConnectionNote } from "@/components/craft";
import { Icon } from "@/components/icons";
import { LinkSculpture } from "@/components/brand/link-sculpture";
import { readDrafts, type Draft } from "@/lib/drafts";
export default function VanLinkPage() {
  const [filter, setFilter] = useState("drafts"),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setDrafts(readDrafts());
    } catch {
      setError("No pudimos leer los borradores de este dispositivo.");
    }
    setReady(true);
  }, []);
  return (
    <AppShell wide>
      <TopBar brand />
      <PageIntro
        eyebrow="COBRAR, ASÍ DE SIMPLE"
        title="Tus VanLinks"
        description="Cada cobro empieza con un link."
        action={
          <PressButton href="/vanlink/create">
            <Icon name="plus" size={19} />
            Preparar link
          </PressButton>
        }
      />
      <div className="vanlink-grid">
        <section className="list-panel">
          <div className="filter-row" aria-label="Filtrar VanLinks">
            {[
              ["drafts", "Borradores"],
              ["active", "Activos"],
              ["paid", "Pagados"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
                {key === "drafts" && drafts.length > 0 && (
                  <span>{drafts.length}</span>
                )}
              </button>
            ))}
          </div>
          {!ready ? (
            <div
              className="skeleton-row"
              role="status"
              aria-label="Cargando borradores"
            />
          ) : filter === "drafts" && drafts.length > 0 ? (
            <div>
              {drafts.map((d) => (
                <Link
                  href={"/vanlink/preview?id=" + encodeURIComponent(d.id)}
                  className="draft-row"
                  key={d.id}
                >
                  <span className="row-icon">
                    <Icon name="link" />
                  </span>
                  <div>
                    <strong>{d.concept || "Sin concepto"}</strong>
                    <small>Borrador · En este dispositivo</small>
                  </div>
                  <span>
                    {d.amount}
                    <small>USDC</small>
                  </span>
                  <Icon name="chevron" size={17} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="link"
              title={
                filter === "drafts"
                  ? "Tu primer link empieza aquí"
                  : filter === "active"
                    ? "Aún no hay links activos"
                    : "Tus cobros, en orden"
              }
              description={
                filter === "drafts"
                  ? "Elige un monto y un concepto. Puedes guardar tu borrador y retomarlo después."
                  : "Cuando tu wallet esté conectada, aquí verás el estado real de tus cobros."
              }
              action={
                filter === "drafts" ? (
                  <Link className="text-link" href="/vanlink/create">
                    Preparar mi primer link <Icon name="arrow" size={17} />
                  </Link>
                ) : undefined
              }
            />
          )}{" "}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </section>
        <aside className="how-panel">
          <div className="how-sculpture"><LinkSculpture /></div>
          <h3>
            Menos pasos.
            <br />
            Más fácil.
          </h3>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Prepara tu cobro</strong>
                <p>Importe, concepto y vencimiento.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Comparte tu link</strong>
                <p>Al conectar tu wallet, podrás publicarlo.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Recibe en USDC</strong>
                <p>Consulta la confirmación en tu actividad.</p>
              </div>
            </li>
          </ol>
        </aside>
      </div>
      <ConnectionNote>
        Los borradores se guardan únicamente en este navegador. Todavía no son
        enlaces de pago.
      </ConnectionNote>
    </AppShell>
  );
}
