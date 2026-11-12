"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletMode } from "@/components/mode/wallet-mode";

const CHOICES = [
  { id: "polygon-usdt", asset: "USDC", network: "Polygon", label: "USDC", note: "Polygon" },
  { id: "base-usdc", asset: "USDC", network: "Base", label: "USDC", note: "Base · legado" },
  { id: "base-usdt", asset: "USDT", network: "Base", label: "USDT", note: "Base · legado" },
  { id: "bitcoin-btc", asset: "BTC", network: "Bitcoin", label: "BTC", note: "Bitcoin · legado" },
] as const;

export function CreateVanLinkForm() {
  const router = useRouter();
  const { mode } = useWalletMode();
  const [choiceId, setChoiceId] = useState<(typeof CHOICES)[number]["id"]>("polygon-usdt");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [days, setDays] = useState("7");
  const [state, setState] = useState<"idle" | "creating" | "error">("idle");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");

  const choice = mode === "simple" ? CHOICES[0] : CHOICES.find(item => item.id === choiceId) || CHOICES[0];

  const create = async () => {
    setMessage("");
    const clean = amount.trim().replace(",", ".");
    if (choice.network === "Polygon" && (!/^[0-9]+(?:\.[0-9]{1,6})?$/.test(clean) || !(Number(clean) > 0))) {
      setMessage("Para cobrar USDC en Polygon escribe un monto positivo con máximo seis decimales.");
      return;
    }
    setState("creating");
    try {
      const response = await fetch("/api/vanlink", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: choice.asset, network: choice.network,
          amount: clean || undefined, concept, days: Number(days),
        }),
      });
      const result = await response.json() as { error?: string; vanlink?: { slug: string } };
      if (!response.ok || !result.vanlink) {
        throw new Error(result.error === "polygon_no_habilitado"
          ? "VanLink USDC Polygon se está validando. Aún no podemos publicar cobros en esa red."
          : result.error === "sin_wallet"
          ? "Tu wallet todavía se está generando. Revisa tu cuenta."
          : result.error === "monto_polygon_invalido"
          ? "Escribe un monto de USDC con máximo seis decimales."
          : result.error || "No pudimos crear el cobro.");
      }
      setLink(window.location.origin + "/l/" + result.vanlink.slug);
    } catch (error) {
      setMessage((error as Error).message || "No pudimos crear el cobro.");
      setState("error");
    }
  };

  if (link) return (
    <div className="vl-done">
      <strong>Tu VanLink está listo</strong>
      <code className="vl-url">{link}</code>
      <p className="vd-legal-note">El cobro se realiza en {choice.asset} de {choice.network}. El pagador debe verificar la red antes de enviar.</p>
      <div className="vl-done-actions">
        <button type="button" className="dev-action" onClick={() => { void navigator.clipboard?.writeText(link); }}>Copiar link</button>
        <button type="button" className="dev-deny" onClick={() => {
          if (navigator.share) void navigator.share({ title: "VanLink · USDC", url: link });
          else window.open("https://wa.me/?text=" + encodeURIComponent("Te comparto mi VanLink de pago: " + link), "_blank", "noopener");
        }}>Compartir por WhatsApp</button>
      </div>
      <button type="button" className="vl-link-btn" onClick={() => router.push("/vanlink")}>Ver mis VanLinks</button>
    </div>
  );

  return (
    <div className="vl-form">
      <div className="vd-polygon-line">
        <strong>{choice.asset}</strong>
        <span>{choice.network} {choice.network === "Polygon" ? "PoS" : ""}</span>
      </div>
      {mode === "expert" && (
        <div className="vl-assets" role="group" aria-label="Activo y red de cobro">
          {CHOICES.map(item => (
            <button key={item.id} type="button" className={choice.id === item.id ? "vl-asset active" : "vl-asset"}
              aria-pressed={choice.id === item.id} onClick={() => setChoiceId(item.id)}>
              <strong>{item.label}</strong><small>{item.note}</small>
            </button>
          ))}
        </div>
      )}
      <label htmlFor="vanlink-amount">Monto en {choice.asset}{choice.network === "Polygon" ? "" : " (opcional)"}</label>
      <input id="vanlink-amount" inputMode="decimal" value={amount} placeholder="0.00"
        onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}/>
      <label htmlFor="vanlink-concept">Concepto</label>
      <input id="vanlink-concept" value={concept} maxLength={80} placeholder="¿Qué estás cobrando?"
        onChange={e => setConcept(e.target.value)}/>
      <label htmlFor="vanlink-days">Vigencia</label>
      <select id="vanlink-days" value={days} onChange={e => setDays(e.target.value)}>
        <option value="1">1 día</option>
        <option value="7">7 días</option>
        <option value="30">30 días</option>
        <option value="90">90 días</option>
      </select>
      <button type="button" className="dev-action" onClick={() => { void create(); }} disabled={state === "creating"}>
        {state === "creating" ? "Creando cobro…" : "Crear VanLink"}
      </button>
      {message && <p role="alert" className="dev-error">{message}</p>}
      <p className="vl-note">
        VanLink no custodia: la persona paga directamente a tu dirección de {choice.network}.
        {choice.network === "Polygon" ? " Para confirmar el cobro, el pagador deberá compartir el hash de su transferencia." : ""}
      </p>
    </div>
  );
}
