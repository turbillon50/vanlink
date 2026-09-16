"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import {
  PageIntro,
  MoneyInput,
  NetworkPill,
  ConnectionNote,
  SummaryRow,
} from "@/components/craft";
import { normalizeAmount } from "@/lib/drafts";
export default function SendPage() {
  const [address, setAddress] = useState(""),
    [amount, setAmount] = useState(""),
    [note, setNote] = useState(""),
    [review, setReview] = useState(false),
    [error, setError] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !/^0x[a-fA-F0-9]{40}$/.test(address.trim()) ||
      /^0x0{40}$/i.test(address.trim())
    ) {
      setError(
        "Revisa la dirección: debe ser una dirección válida de la red Base.",
      );
      return;
    }
    if (!normalizeAmount(amount)) {
      setError("Escribe un monto mayor a cero, con hasta 6 decimales.");
      return;
    }
    setError("");
    setReview(true);
  }
  return (
    <AppShell>
      <TopBar title={review ? "Revisar envío" : "Enviar"} backHref="/" />
      <PageIntro
        eyebrow="USDC EN BASE"
        title={review ? "Revisa los datos" : "¿A quién le envías?"}
        description={
          review
            ? "Este resumen no envía dinero."
            : "Prepara los datos de tu próximo envío."
        }
      />
      {review ? (
        <div className="form-stack">
          <div className="summary-panel">
            <SummaryRow label="Dirección" value={address.trim()} />
            <SummaryRow
              label="Monto"
              value={normalizeAmount(amount) + " USDC"}
            />
            <SummaryRow label="Red" value="Base" />
            {note && <SummaryRow label="Nota" value={note} />}
            <SummaryRow label="Comisión" value="Sin cotizar" />
          </div>
          <ConnectionNote>
            Para cotizar la comisión y firmar el envío necesitas una wallet
            conectada. No se ha realizado ninguna operación.
          </ConnectionNote>
          <PressButton onClick={() => setReview(false)} variant="secondary">
            Editar datos
          </PressButton>
          <PressButton disabled>Envío pendiente de conexión</PressButton>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <label className="field-label">
            Dirección de destino
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              required
            />
          </label>
          <MoneyInput
            label="Monto a enviar"
            value={amount}
            onChange={setAmount}
          />
          <NetworkPill />
          <label className="field-label">
            Nota opcional
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              placeholder="¿Para qué es este envío?"
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <PressButton type="submit">Revisar datos</PressButton>
          <ConnectionNote />
        </form>
      )}
    </AppShell>
  );
}
