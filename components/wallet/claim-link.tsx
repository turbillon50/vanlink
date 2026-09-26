"use client";

/**
 * components/wallet/claim-link.tsx — página pública de un Link de Bitcoin.
 * Sin cuenta, sin registro: pega tu dirección de Bitcoin y listo.
 * La llave llega en el "#" del link y solo vive en este navegador.
 */
import { useEffect, useMemo, useState } from "react";
import { PressButton } from "@/components/ui/press-button";
import { isValidBtcAddress, satsToBtc, outputScript, type Utxo, type BtcFeeRates } from "@/lib/send/bitcoin-tx";
import { parseLinkToken, sweepLink, type LinkKey } from "@/lib/send/claim-link";

type State = { utxos: Utxo[]; balance: number; unconfirmed: boolean; status: "disponible" | "reclamado" | "sin_fondos"; fees: BtcFeeRates };

type Price = { value: number; currency: "MXN" | "USD" };
const approx = (sats: number, p: Price | null) =>
  p ? `≈ $${((sats / 1e8) * p.value).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.currency}` : "";

export function ClaimLink() {
  const [key, setKey] = useState<LinkKey | null | undefined>(undefined);
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [price, setPrice] = useState<Price | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ txid: string; explorer: string; sats: number } | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const k = parseLinkToken(window.location.hash.slice(1));
    setKey(k);
    if (!k) return;
    void fetch(`/api/claim/${k.address}`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject())).then(setState).catch(() => setLoadError(true));
    // Valor aproximado para que el que recibe entienda cuánto es.
    void fetch("/api/market", { cache: "no-store" }).then(r => r.json()).then((d: { quotes?: { symbol: string; price: number }[]; usdMxn?: number }) => {
      const btc = d.quotes?.find(q => q.symbol === "BTC")?.price;
      // Con tipo de cambio real se muestra en pesos; sin él, en dólares. Nunca un tipo inventado.
      if (btc) setPrice(d.usdMxn ? { value: btc * d.usdMxn, currency: "MXN" } : { value: btc, currency: "USD" });
    }).catch(() => {});
  }, []);

  const hint = useMemo(() => {
    const v = to.trim();
    if (!v) return "";
    if (/^0x/i.test(v)) return "Esa es una dirección de Ethereum/Base. Necesitas la de Bitcoin.";
    if (/^(lnbc|lnurl)/i.test(v) || v.includes("@")) return "Eso es Lightning. Necesitas una dirección de Bitcoin normal (empieza con bc1, 1 o 3).";
    return isValidBtcAddress(v) ? "" : "Esa dirección no es válida. Revisa que esté completa.";
  }, [to]);

  async function paste() {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) { setTo(t.replace(/^bitcoin:/i, "").split("?")[0]); setError(""); }
    } catch { setError("Tu navegador no dejó pegar. Mantén presionado el campo y elige Pegar."); }
  }

  async function claim() {
    if (!key || !state || busy) return;
    const dest = to.trim().replace(/^bitcoin:/i, "").split("?")[0];
    if (!dest || hint) { setError(hint || "Pega tu dirección de Bitcoin."); return; }
    if (dest === key.address) { setError("Esa es la dirección del link, no la tuya."); return; }
    setBusy(true); setError("");
    try {
      // Refresca saldo justo antes de firmar: si alguien más ya reclamó, se sabe aquí.
      const fresh = await fetch(`/api/claim/${key.address}`, { cache: "no-store" }).then(r => r.json()) as State;
      if (fresh.status !== "disponible") { setState(fresh); throw new Error("Este link ya fue reclamado."); }
      // Si el fondeo aún no confirma, se paga comisión rápida para que el conjunto no se atore.
      const rate = fresh.unconfirmed ? fresh.fees.fastest : fresh.fees.halfHour;
      outputScript(dest);
      const signed = sweepLink(key, fresh.utxos, dest, rate);
      const r = await fetch("/api/claim/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hex: signed.hex }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message && !/_/.test(d.message) ? d.message : "La red no aceptó el envío. Intenta de nuevo en un minuto.");
      setDone({ txid: d.txid, explorer: d.explorer, sats: signed.plan.amount });
      history.replaceState(null, "", "/c"); // la llave sale de la barra de direcciones
    } catch (e) {
      const m = (e as Error).message || "";
      setError(/fondos_insuficientes/.test(m) ? "El saldo del link no alcanza para la comisión de la red." : m.length < 140 && !/_/.test(m) ? m : "No se pudo completar. No se movió dinero.");
    } finally { setBusy(false); }
  }

  if (key === undefined) return <div className="snd-skeleton" aria-label="Cargando" />;
  if (key === null) return <div className="snd-gate"><p>Este link está incompleto. Pídele a quien te lo mandó que lo copie completo, incluyendo todo lo que va después del #.</p></div>;

  if (done) return (
    <div className="snd-done pendiente">
      <div className="snd-done-orb" aria-hidden="true">✓</div>
      <h2>¡Listo! Ya va en camino</h2>
      <p className="snd-done-amt">{satsToBtc(done.sats)} BTC</p>
      <p className="snd-done-note">Bitcoin tarda de 10 a 30 minutos en confirmar. En Mercado Pago aparece en Criptomonedas → Bitcoin cuando la red lo confirme. Este link ya no tiene saldo.</p>
      <div className="snd-actions"><PressButton href={done.explorer} variant="secondary" target="_blank" rel="noopener noreferrer">Ver en el explorador</PressButton></div>
    </div>
  );

  if (loadError) return <p className="field-error" role="alert">No pudimos consultar el link. Revisa tu conexión y recarga.</p>;
  if (!state) return <div className="snd-skeleton" aria-label="Cargando" />;

  if (state.status === "reclamado") return (
    <div className="snd-gate"><p><strong>Este link ya fue reclamado.</strong> El Bitcoin ya salió hacia la dirección que pusieron. Si no fuiste tú, avísale a quien te lo mandó.</p></div>
  );
  if (state.status === "sin_fondos") return (
    <div className="snd-gate"><p>Este link todavía no tiene saldo. Si te lo acaban de mandar, espera un minuto y recarga.</p></div>
  );

  return (
    <div className="form-stack">
      <div className="snd-hero">
        <span>Te enviaron</span>
        <strong>{satsToBtc(state.balance)} BTC</strong>
        <small>{approx(state.balance, price)}</small>
      </div>
      <label className="field-label">
        Tu dirección de Bitcoin
        <div className="snd-addr-field">
          <input value={to} onChange={e => { setTo(e.target.value); setError(""); }} placeholder="bc1… , 1… o 3…"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
          <button type="button" className="snd-paste" onClick={paste}>Pegar</button>
        </div>
      </label>
      {to && hint && <p className="snd-hint">{hint}</p>}
      <button type="button" className="snd-help-toggle" onClick={() => setHelp(!help)} aria-expanded={help}>
        {help ? "Ocultar" : "¿Dónde saco mi dirección en Mercado Pago?"}
      </button>
      {help && (
        <ol className="snd-help">
          <li>Abre Mercado Pago y entra a <strong>Criptomonedas</strong>.</li>
          <li>Toca <strong>Bitcoin</strong> y luego <strong>Recibir</strong>.</li>
          <li>Toca <strong>Copiar</strong>, regresa aquí y dale <strong>Pegar</strong>.</li>
        </ol>
      )}
      <p className="rcv-warn">Solo dirección de Bitcoin (red Bitcoin). Una dirección equivocada pierde el dinero y no se puede revertir.</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      <PressButton onClick={claim} disabled={busy || !to.trim()}>{busy ? "Enviando a tu wallet…" : "Recibir mi Bitcoin"}</PressButton>
      <p className="snd-foot">Sin registrarte. Tu Bitcoin sale directo de este link a tu dirección y el link se desactiva.</p>
    </div>
  );
}
