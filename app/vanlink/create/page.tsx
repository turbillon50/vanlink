"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import {
  MoneyInput,
  NetworkPill,
  PageIntro,
  ConnectionNote,
} from "@/components/craft";
import { normalizeAmount, saveDraft } from "@/lib/drafts";
export default function CreatePage() {
  const router = useRouter(),
    [amount, setAmount] = useState(""),
    [concept, setConcept] = useState(""),
    [expiry, setExpiry] = useState("7"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = normalizeAmount(amount);
    if (!parsed) {
      setError("Escribe un monto mayor a cero, con hasta 6 decimales.");
      return;
    }
    if (!concept.trim()) {
      setError("Agrega un concepto para identificar el cobro.");
      return;
    }
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      saveDraft({
        id,
        amount: parsed,
        concept: concept.trim(),
        expiresIn: expiry,
        createdAt: new Date().toISOString(),
      });
      router.push("/vanlink/preview?id=" + id);
    } catch {
      setError(
        "No se pudo guardar en este navegador. Conservamos tus datos para que lo intentes de nuevo.",
      );
      setBusy(false);
    }
  }
  return (
    <AppShell>
      <TopBar title="Preparar VanLink" backHref="/vanlink" />
      <PageIntro
        eyebrow="UN NUEVO COBRO"
        title="¿Cuánto quieres cobrar?"
        description="Un monto. Un concepto. Así de fácil."
      />
      <form onSubmit={submit} className="form-stack">
        <MoneyInput
          value={amount}
          onChange={setAmount}
          label="Monto a cobrar"
        />
        <NetworkPill />
        <label className="field-label">
          Concepto
          <input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            maxLength={80}
            placeholder="¿Por qué te van a pagar?"
            required
          />
        </label>
        <fieldset className="expiry-picker">
          <legend>Vencimiento al publicar</legend>
          {[
            ["1", "24 horas"],
            ["7", "7 días"],
            ["30", "30 días"],
          ].map(([v, l]) => (
            <label key={v}>
              <input
                type="radio"
                name="expiry"
                value={v}
                checked={expiry === v}
                onChange={() => setExpiry(v)}
              />
              <span>{l}</span>
            </label>
          ))}
        </fieldset>
        <ConnectionNote>
          Guarda el borrador ahora. La publicación se habilitará al conectar tu
          wallet.
        </ConnectionNote>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <PressButton type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar y revisar borrador"}
        </PressButton>
      </form>
    </AppShell>
  );
}
