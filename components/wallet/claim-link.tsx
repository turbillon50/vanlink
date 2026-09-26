"use client";

/**
 * components/wallet/claim-link.tsx — página pública de un Link de Bitcoin.
 * Una sola tarjeta: cuánto te mandaron, tu dirección, un botón. Sin cuenta,
 * sin navegación, sin nada más. El resultado se refleja en la misma tarjeta.
 * La llave llega en el "#" del link y solo vive en este navegador.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/logo";
import { isValidBtcAddress, satsToBtc, type Utxo, type BtcFeeRates } from "@/lib/send/bitcoin-tx";
import { parseLinkToken, sweepLink, type LinkKey } from "@/lib/send/claim-link";

type LinkState = { utxos: Utxo[]; balance: number; unconfirmed: boolean; status: "disponible" | "reclamado" | "sin_fondos"; fees: BtcFeeRates };
type Price = { value: number; currency: "MXN" | "USD" };
type Sent = { txid: string; explorer: string; sats: number; to: string };

const approx = (sats: number, p: Price | null) =>
  p ? `≈ $${((sats / 1e8) * p.value).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.currency}` : "";
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

export function ClaimLink() {
  const [key, setKey] = useState<LinkKey | null | undefined>(undefined);
  const [state, setState] = useState<LinkState | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [help, setHelp] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async (k: LinkKey) => {
    try {
      const r = await fetch(`/api/claim/${k.address}`, { cache: "no-store" });
      if (r.ok) setState(await r.json());
    } catch { /* reintenta en el siguiente ciclo */ }
  }, []);

  useEffect(() => {
    const k = parseLinkToken(window.location.hash.slice(1));
    setKey(k);
    if (k) void load(k);
    void fetch("/api/market", { cache: "no-store" }).then(r => r.json()).then((d: { quotes?: { symbol: string; price: number }[]; usdMxn?: number }) => {
      const btc = d.quotes?.find(q => q.symbol === "BTC")?.price;
      if (btc) setPrice(d.usdMxn ? { value: btc * d.usdMxn, currency: "MXN" } : { value: btc, currency: "USD" });
    }).catch(() => {});
  }, [load]);

  // Mientras el link no tenga saldo, se revisa solo cada 10 s: en cuanto llega, se ve.
  useEffect(() => {
    if (!key || sent || state?.status === "disponible" || state?.status === "reclamado") return;
    const t = setInterval(() => void load(key), 10_000);
    return () => clearInterval(t);
  }, [key, sent, state?.status, load]);

  // Ya enviado: se sigue la confirmación en la red y se refleja aquí mismo.
  useEffect(() => {
    if (!sent || confirmed) return;
    const t = setInterval(async () => {
      try {
        const s = await fetch(`/api/claim/tx/${sent.txid}`, { cache: "no-store" }).then(r => r.json()) as { confirmed?: boolean };
        if (s.confirmed) setConfirmed(true);
      } catch { /* sigue intentando */ }
    }, 20_000);
    return () => clearInterval(t);
  }, [sent, confirmed]);

  const clean = (v: string) => v.trim().replace(/^bitcoin:/i, "").split("?")[0];
  const hint = useMemo(() => {
    const v = clean(to);
    if (!v) return "";
    if (/^0x/i.test(v)) return "Esa dirección es de Ethereum/Base. Necesitas la de Bitcoin.";
    if (/^(lnbc|lnurl)/i.test(v) || v.includes("@")) return "Eso es Lightning. Necesitas una dirección de Bitcoin (empieza con bc1, 1 o 3).";
    return isValidBtcAddress(v) ? "" : "Dirección incompleta o inválida.";
  }, [to]);
  const valid = Boolean(clean(to)) && !hint;

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setTo(clean(t)); setError(""); }
    } catch { input.current?.focus(); setError("Mantén presionado el campo y elige Pegar."); }
  }

  async function claim(e?: React.FormEvent) {
    e?.preventDefault();
    if (!key || busy) return;
    const dest = clean(to);
    if (!valid) { setError(hint || "Pega tu dirección de Bitcoin."); return; }
    if (dest === key.address) { setError("Esa es la dirección del link, no la tuya."); return; }
    setBusy(true); setError("");
    try {
      const fresh = await fetch(`/api/claim/${key.address}`, { cache: "no-store" }).then(r => r.json()) as LinkState;
      setState(fresh);
      if (fresh.status === "reclamado") throw new Error("Este link ya fue reclamado.");
      if (fresh.status !== "disponible") throw new Error("El link todavía no tiene saldo. En cuanto llegue lo verás aquí.");
      const rate = fresh.unconfirmed ? fresh.fees.fastest : fresh.fees.halfHour;
      const signed = sweepLink(key, fresh.utxos, dest, rate);
      const r = await fetch("/api/claim/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hex: signed.hex }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message && !/_/.test(d.message) ? d.message : "La red no aceptó el envío. Intenta de nuevo en un minuto.");
      setSent({ txid: d.txid, explorer: d.explorer, sats: signed.plan.amount, to: dest });
      history.replaceState(null, "", "/c"); // la llave sale de la barra de direcciones
    } catch (err) {
      const m = (err as Error).message || "";
      setError(/fondos_insuficientes/.test(m) ? "El saldo del link no alcanza para la comisión de la red." : m.length < 140 && !/_/.test(m) ? m : "No se pudo completar. No se movió dinero.");
    } finally { setBusy(false); }
  }

  /* ---------- una sola tarjeta, cambia de estado en su lugar ---------- */
  const status: "cargando" | "invalido" | "esperando" | "listo" | "reclamado" | "enviado" | "confirmado" =
    key === null ? "invalido" : sent ? (confirmed ? "confirmado" : "enviado") : !state ? "cargando"
      : state.status === "reclamado" ? "reclamado" : state.status === "sin_fondos" ? "esperando" : "listo";

  const amountSats = sent?.sats ?? state?.balance ?? 0;
  const showForm = status === "listo" || status === "esperando" || status === "cargando";

  return (
    <main className="clm">
      <header className="clm-top"><Wordmark size={22} /></header>

      <section className={`clm-card ${status}`} aria-live="polite">
        <div className="clm-orb" aria-hidden="true">
          {status === "confirmado" || status === "reclamado" ? (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          ) : status === "enviado" || status === "esperando" ? (
            <span className="clm-spin" />
          ) : status === "invalido" ? (
            <span className="clm-bang">!</span>
          ) : (
            <span className="clm-btc">₿</span>
          )}
        </div>

        <p className="clm-label">
          {status === "invalido" ? "Link incompleto"
            : status === "reclamado" ? "Este link ya fue reclamado"
            : status === "enviado" ? "Va en camino a tu wallet"
            : status === "confirmado" ? "Recibido en tu wallet"
            : status === "esperando" ? "Esperando que llegue el saldo"
            : "Te enviaron"}
        </p>

        {status === "invalido" ? (
          <p className="clm-sub">Pídele a quien te lo mandó que te lo copie completo, con todo lo que va después del #.</p>
        ) : status === "cargando" ? (
          <div className="clm-amount-skel" aria-label="Cargando" />
        ) : status === "reclamado" ? (
          <p className="clm-sub">El Bitcoin ya salió hacia la dirección que pusieron. Si no fuiste tú, avísale a quien te lo mandó.</p>
        ) : status === "esperando" ? (
          <p className="clm-sub">Se actualiza solo. En cuanto llegue el Bitcoin aparece aquí el monto.</p>
        ) : (
          <>
            <p className="clm-amount">{satsToBtc(amountSats)} <span>BTC</span></p>
            <p className="clm-fiat">{approx(amountSats, price)}</p>
          </>
        )}

        {showForm && (
          <form className="clm-form" onSubmit={claim} noValidate>
            <label htmlFor="clm-to" className="clm-field-label">Tu dirección de Bitcoin</label>
            <div className={`clm-field ${to && hint ? "bad" : valid ? "ok" : ""}`}>
              <input id="clm-to" ref={input} value={to} onChange={e => { setTo(e.target.value); setError(""); }}
                placeholder="bc1… , 1… o 3…" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
              <button type="button" onClick={paste}>Pegar</button>
            </div>
            {to && hint && <p className="clm-hint">{hint}</p>}
            {error && <p className="clm-error" role="alert">{error}</p>}
            <button type="submit" className="clm-go" disabled={busy || status !== "listo" || !valid}>
              {busy ? "Enviando…" : status === "esperando" ? "Esperando saldo" : "Recibir"}
            </button>
            <button type="button" className="clm-help-toggle" onClick={() => setHelp(!help)} aria-expanded={help}>
              ¿Dónde saco mi dirección en Mercado Pago?
            </button>
            {help && (
              <ol className="clm-help">
                <li>Mercado Pago → <strong>Criptomonedas</strong> → <strong>Bitcoin</strong></li>
                <li>Toca <strong>Recibir</strong> y luego <strong>Copiar</strong></li>
                <li>Regresa aquí y toca <strong>Pegar</strong></li>
              </ol>
            )}
          </form>
        )}

        {(status === "enviado" || status === "confirmado") && sent && (
          <div className="clm-result">
            <div className="clm-row"><span>Para</span><code>{short(sent.to)}</code></div>
            <div className="clm-row"><span>Estado</span><strong>{confirmed ? "Confirmado ✓" : "Confirmando en la red…"}</strong></div>
            <p className="clm-sub">{confirmed ? "Ya está en tu wallet. Es definitivo." : "Bitcoin tarda de 10 a 30 minutos. Puedes cerrar esta página; llega igual."}</p>
            <a className="clm-go ghost" href={sent.explorer} target="_blank" rel="noopener noreferrer">Ver transacción</a>
          </div>
        )}
      </section>

      <p className="clm-foot">Sin cuenta y sin registro. Solo red Bitcoin: una dirección equivocada pierde el dinero.</p>
    </main>
  );
}
