"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import { PageIntro, EmptyState, ConnectionNote } from "@/components/craft";
import { Icon } from "@/components/icons";
import { readDrafts, type Draft } from "@/lib/drafts";

type LinkRecord = {
  slug: string; asset: string; network: string; amount: string | null;
  concept: string | null; status: string; createdAt: string;
};
type Filter = "active" | "paid" | "drafts";

export default function VanLinkPage() {
  const [filter, setFilter] = useState<Filter>("active");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let live = true;
    try { setDrafts(readDrafts()); } catch { setError("No pudimos leer tus borradores locales."); }
    void (async () => {
      try {
        const response = await fetch("/api/vanlink", { cache: "no-store" });
        if (!live) return;
        if (response.status === 401) { setGuest(true); return; }
        if (!response.ok) throw new Error("No pudimos consultar tus VanLinks.");
        const json = await response.json() as { vanlinks?: LinkRecord[] };
        if (live) setLinks(Array.isArray(json.vanlinks) ? json.vanlinks : []);
      } catch (cause) { if (live) setError((cause as Error).message); }
      finally { if (live) setReady(true); }
    })();
    return () => { live = false; };
  }, []);

  const active = links.filter(item => item.status === "activo");
  const paid = links.filter(item => item.status === "pagado");
  const shown = filter === "paid" ? paid : active;

  const share = (slug: string) => {
    const url = window.location.origin + "/l/" + slug;
    if (navigator.share) {
      void navigator.share({ title: "VanLink · VanDeFi", url }).catch(() => {});
    } else {
      window.open("https://wa.me/?text=" + encodeURIComponent("Te comparto mi VanLink: " + url), "_blank", "noopener");
    }
  };
  return <AppShell wide>
    <TopBar title="VanLink"/>
    <PageIntro eyebrow="USDC · COBRAR POR WHATSAPP" title="Mis VanLinks"
      description="Crea un cobro, compártelo y consulta su confirmación real en blockchain."
      action={<PressButton href="/vanlink/create"><Icon name="plus" size={18}/> Nuevo VanLink</PressButton>} />
    <section className="list-panel">
      <div className="filter-row" role="group" aria-label="Filtrar VanLinks">
        {([
          ["active", "Activos", active.length],
          ["paid", "Pagados", paid.length],
          ["drafts", "Borradores", drafts.length],
        ] as const).map(([key, label, count]) => (
          <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}<span>{count}</span>
          </button>
        ))}
      </div>
      {!ready ? <div className="skeleton-row" aria-label="Cargando VanLinks"/> : guest ? (
        <EmptyState icon="link" title="Inicia sesión para ver tus cobros"
          description="Consulta el estado de tu wallet en tu perfil."
          action={<Link href="/login" className="text-link">Entrar a mi cuenta</Link>} />
      ) : filter === "drafts" ? (
        drafts.length ? <div>{drafts.map(d => (
          <Link key={d.id} href={"/vanlink/preview?id=" + encodeURIComponent(d.id)} className="draft-row">
            <span className="row-icon"><Icon name="link"/></span>
            <div><strong>{d.concept || "Sin concepto"}</strong><small>Borrador · solo en este dispositivo</small></div>
            <span>{d.amount}<small>USDC</small></span><Icon name="chevron" size={17}/>
          </Link>
        ))}</div> : <EmptyState icon="link" title="No tienes borradores" description="Puedes preparar un cobro desde Nuevo VanLink." />
      ) : shown.length ? (
        <div>{shown.map(item => (
          <div className="draft-row vd-link-real-row" key={item.slug}>
            <span className="row-icon"><Icon name="link"/></span>
            <div>
              <strong>{item.concept || "Cobro VanDeFi"}</strong>
              <small>{item.asset} · {item.network} · {item.status === "pagado" ? "Confirmado" : "Pendiente"}</small>
            </div>
            <div className="vd-link-real-amount"><strong>{item.amount || "Libre"}</strong><small>{item.asset}</small></div>
            <div className="vd-link-real-actions">
              <Link href={"/l/" + item.slug} aria-label="Abrir VanLink"><Icon name="chevron" size={18}/></Link>
              {item.status === "activo" && <button type="button" onClick={() => share(item.slug)} aria-label="Compartir VanLink"><Icon name="send" size={17}/></button>}
              {item.status === "activo" && <button type="button" onClick={() => {
                void navigator.clipboard?.writeText(window.location.origin + "/l/" + item.slug).then(() => setCopied(item.slug)).catch(() => {});
              }} aria-label="Copiar VanLink"><Icon name="copy" size={17}/></button>}
            </div>
            {copied === item.slug && <span className="vd-copied-indicator">Copiado</span>}
          </div>
        ))}</div>
      ) : <EmptyState icon="link" title={filter === "paid" ? "Aún no hay pagos confirmados" : "Tu primer cobro comienza aquí"}
        description={filter === "paid" ? "Los pagos se mostrarán cuando se confirmen en la red." : "Crea un link con monto y concepto. Los activos de la red histórica siguen visibles."}
        action={<Link className="text-link" href="/vanlink/create">Nuevo VanLink</Link>} />}
      {error && <p role="alert" className="field-error">{error}</p>}
    </section>
    <ConnectionNote>Los links creados se guardan en tu cuenta. Los borradores antiguos siguen en este navegador. En Polygon, el pagador verifica su TXID hasta habilitarse el seguimiento automático.</ConnectionNote>
  </AppShell>;
}
