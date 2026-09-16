"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import {
  NetworkPill,
  ConnectionNote,
  EmptyState,
  SummaryRow,
} from "@/components/craft";
import { readDrafts, type Draft } from "@/lib/drafts";
import { Icon } from "@/components/icons";
function Preview() {
  const params = useSearchParams(),
    [draft, setDraft] = useState<Draft | null>(null),
    [ready, setReady] = useState(false),
    [copied, setCopied] = useState(false),
    [error, setError] = useState(""),
    id = params.get("id");
  useEffect(() => {
    try {
      setDraft(readDrafts().find((d) => d.id === id) || null);
    } catch {
      setError("No pudimos abrir el borrador.");
    }
    setReady(true);
  }, [id]);
  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(
        "BORRADOR · NO ES UN ENLACE DE PAGO\n" +
          draft.concept +
          "\n" +
          draft.amount +
          " USDC en Base\nPendiente de conectar wallet y publicar.",
      );
      setCopied(true);
    } catch {
      setError(
        "No se pudo copiar. Selecciona los datos del borrador para copiarlos.",
      );
    }
  }
  return (
    <AppShell>
      <TopBar title="Tu borrador" backHref="/vanlink" />
      {!ready ? (
        <div
          className="skeleton-row"
          role="status"
          aria-label="Cargando borrador"
        />
      ) : draft ? (
        <>
          <div className="draft-preview">
            <span className="save-badge">
              <Icon name="check" size={16} />
              Guardado en este dispositivo
            </span>
            <span className="preview-link-orb">
              <Icon name="link" size={38} />
            </span>
            <h2>{draft.concept}</h2>
            <p className="preview-amount">
              {draft.amount}
              <span>USDC</span>
            </p>
            <NetworkPill />
          </div>
          <div className="summary-panel">
            <SummaryRow label="Estado" value="Borrador" />
            <SummaryRow
              label="Vencimiento al publicar"
              value={draft.expiresIn + " días"}
            />
            <SummaryRow
              label="Wallet receptora"
              value="Pendiente de conectar"
            />
          </div>
          <ConnectionNote>
            Este borrador aún no puede recibir dinero. Al conectar tu wallet
            podrás generar un enlace de pago.
          </ConnectionNote>
          <div className="form-stack">
            <PressButton onClick={copy} variant="secondary">
              <Icon name={copied ? "check" : "copy"} size={18} />
              {copied ? "Datos copiados" : "Copiar datos del borrador"}
            </PressButton>
            <PressButton href="/vanlink">Volver a mis VanLinks</PressButton>
            <span className="sr-only" role="status">
              {copied ? "Borrador copiado" : ""}
            </span>
          </div>
        </>
      ) : (
        <EmptyState
          icon="link"
          title="No encontramos este borrador"
          description="Los borradores solo están disponibles en el navegador donde los guardaste."
          action={<PressButton href="/vanlink">Ver mis VanLinks</PressButton>}
        />
      )}{" "}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </AppShell>
  );
}
export default function PreviewPage() {
  return (
    <Suspense fallback={<p className="loading-label">Abriendo borrador…</p>}>
      <Preview />
    </Suspense>
  );
}
