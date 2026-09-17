"use client";

/**
 * components/vanlink/create-form.tsx
 * Crea un VanLink real contra la API. Cobrar no es firmar: por eso funciona
 * aunque este dispositivo todavía no pueda enviar fondos.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const ASSETS = [
  { id: "USDC", label: "USDC", net: "Base" },
  { id: "USDT", label: "USDT", net: "Base" },
  { id: "BTC", label: "BTC", net: "Bitcoin" },
] as const;

export function CreateVanLinkForm() {
  const router = useRouter();
  const [asset, setAsset] = useState<string>("USDC");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [days, setDays] = useState("7");
  const [state, setState] = useState<"idle" | "creando" | "error">("idle");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState<string>("");

  const create = async () => {
    setState("creando");
    setMessage("");
    try {
      const r = await fetch("/api/vanlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, amount: amount || undefined, concept, days: Number(days) }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMessage(
          d.error === "sin_wallet" ? "Activa tu wallet antes de crear un cobro."
          : d.error === "monto_invalido" ? "Revisa el monto."
          : "No pudimos crear el VanLink.",
        );
        setState("error");
        return;
      }
      setLink(`${window.location.origin}/l/${d.vanlink.slug}`);
    } catch {
      setMessage("No pudimos crear el VanLink.");
      setState("error");
    }
  };

  if (link) {
    return (
      <div className="vl-done">
        <strong>Tu VanLink está listo</strong>
        <code className="vl-url">{link}</code>
        <div className="vl-done-actions">
          <button type="button" className="dev-action" onClick={() => {
            navigator.clipboard?.writeText(link).catch(() => undefined);
          }}>Copiar link</button>
          {typeof navigator !== "undefined" && "share" in navigator ? (
            <button type="button" className="dev-deny" onClick={() => {
              void navigator.share({ title: "Cobro VanDeFi", url: link });
            }}>Compartir</button>
          ) : null}
        </div>
        <button type="button" className="vl-link-btn" onClick={() => router.push("/vanlink")}>
          Ver mis VanLinks
        </button>
      </div>
    );
  }

  return (
    <div className="vl-form">
      <label>Activo</label>
      <div className="vl-assets">
        {ASSETS.map((a) => (
          <button key={a.id} type="button"
            className={asset === a.id ? "vl-asset active" : "vl-asset"}
            onClick={() => setAsset(a.id)}>
            <strong>{a.label}</strong><small>{a.net}</small>
          </button>
        ))}
      </div>

      <label htmlFor="monto">Monto (opcional)</label>
      <input id="monto" inputMode="decimal" value={amount} placeholder="Déjalo vacío para monto libre"
        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />

      <label htmlFor="concepto">Concepto</label>
      <input id="concepto" value={concept} maxLength={80} placeholder="¿De qué es el cobro?"
        onChange={(e) => setConcept(e.target.value)} />

      <label htmlFor="vigencia">Vigencia</label>
      <select id="vigencia" value={days} onChange={(e) => setDays(e.target.value)}>
        <option value="1">1 día</option>
        <option value="7">7 días</option>
        <option value="30">30 días</option>
        <option value="90">90 días</option>
      </select>

      <button type="button" className="dev-action" onClick={create} disabled={state === "creando"}>
        {state === "creando" ? "Creando…" : "Crear VanLink"}
      </button>
      {message ? <p className="dev-error">{message}</p> : null}
      <p className="vl-note">
        Quien abra el link paga directo a tu dirección. VanDeFi no toca ese dinero.
      </p>
    </div>
  );
}
