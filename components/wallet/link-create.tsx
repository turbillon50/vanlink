"use client";

/**
 * components/wallet/link-create.tsx — crear un Link de Bitcoin para WhatsApp.
 *
 * Quien recibe NO necesita cuenta: abre el link, pega su dirección de Bitcoin
 * (la de Mercado Pago, Binance, la que sea) y el saldo sale directo hacia allá.
 * La llave desechable del link se genera aquí y se guarda en ESTE dispositivo
 * para poder recuperar el dinero si nadie lo reclama.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { PressButton } from "@/components/ui/press-button";
import { SummaryRow } from "@/components/craft";
import { authConfigured } from "@/lib/auth-config";
import { btcToSats, buildBtcUnsigned, finalizeBtc, planBtcSend, satsToBtc, type BtcFeeRates, type BtcPlan, type Utxo } from "@/lib/send/bitcoin-tx";
import { linkUrl, newLinkKey, parseLinkToken, sweepLink, sweepReserve, type LinkKey } from "@/lib/send/claim-link";

type WalletInfo = { organizationId: string; turnkeyUserId: string; evmAddress: string; bitcoinAddress: string };
type Saved = { token: string; address: string; sats: number; note: string; createdAt: string; fundTxid?: string; recoveredTxid?: string };
type LinkStatus = { status: "disponible" | "reclamado" | "sin_fondos"; balance: number; utxos: Utxo[]; unconfirmed: boolean; fees: BtcFeeRates };

const MIN_SATS = 1000;
const store = (uid: string) => `vandefi.links.v1.${uid}`;
function readLinks(uid: string): Saved[] {
  try { return JSON.parse(localStorage.getItem(store(uid)) || "[]") as Saved[]; } catch { return []; }
}
function writeLinks(uid: string, links: Saved[]) {
  try { localStorage.setItem(store(uid), JSON.stringify(links)); } catch { /* sin almacenamiento: se avisa en la UI */ }
}

function waText(url: string, sats: number, note: string) {
  const extra = note ? `\n\n${note}` : "";
  return `Te mandé ${satsToBtc(sats)} BTC 🟠\n\nÁbrelo, pega tu dirección de Bitcoin (la de Mercado Pago sirve) y te llega directo. No necesitas registrarte:\n${url}${extra}\n\nNo compartas este link: quien lo tenga, lo cobra.`;
}

function Inner() {
  const { isLoaded, userId } = useAuth();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [boot, setBoot] = useState<"cargando" | "sin-sesion" | "sin-wallet" | "listo" | "error">("cargando");
  const [deviceOk, setDeviceOk] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "cotizando" | "firmando" | "transmitiendo">("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ key: LinkKey; sats: number; reserve: number; plan: BtcPlan } | null>(null);
  const [created, setCreated] = useState<Saved | null>(null);
  const [links, setLinks] = useState<Saved[]>([]);
  const [statuses, setStatuses] = useState<Record<string, LinkStatus | "error">>({});
  const [recovering, setRecovering] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) { setBoot("sin-sesion"); return; }
    setLinks(readLinks(userId));
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/wallet", { cache: "no-store" });
        const d = (await r.json()) as { wallet: WalletInfo | null };
        if (!alive) return;
        if (!d.wallet) { setBoot("sin-wallet"); return; }
        setWallet(d.wallet); setBoot("listo");
        const { verifyWalletDevice } = await import("@/lib/wallet/browser");
        const ok = await verifyWalletDevice(userId, d.wallet.organizationId, d.wallet.turnkeyUserId).catch(() => false);
        if (alive) setDeviceOk(ok);
        const p = await fetch("/api/send/btc/prepare", { cache: "no-store" }).then(x => x.json()) as { utxos?: Utxo[] };
        if (alive && p.utxos) setAvailable(p.utxos.reduce((n, u) => n + u.value, 0));
      } catch { if (alive) setBoot("error"); }
    })();
    return () => { alive = false; };
  }, [isLoaded, userId]);

  const refreshStatuses = useCallback(async (list: Saved[]) => {
    const entries = await Promise.all(list.map(async l => {
      try { return [l.address, await fetch(`/api/claim/${l.address}`, { cache: "no-store" }).then(r => r.json()) as LinkStatus] as const; }
      catch { return [l.address, "error"] as const; }
    }));
    setStatuses(Object.fromEntries(entries));
  }, []);
  useEffect(() => { if (links.length) void refreshStatuses(links); }, [links, refreshStatuses]);

  async function quote(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet || busy) return;
    setError("");
    const sats = btcToSats(amount);
    if (!sats) { setError("Escribe un monto válido en BTC (hasta 8 decimales)."); return; }
    if (sats < MIN_SATS) { setError(`El mínimo por link es ${satsToBtc(MIN_SATS)} BTC (${MIN_SATS.toLocaleString("es-MX")} sats), para que la comisión no se lo coma.`); return; }
    setBusy("cotizando");
    try {
      const d = await fetch("/api/send/btc/prepare", { cache: "no-store" }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message); return j; }) as { utxos: Utxo[]; fees: BtcFeeRates };
      const key = newLinkKey();
      // Se aparta la comisión del reclamo (tarifa rápida) para que quien reciba obtenga el monto completo.
      const reserve = sweepReserve(d.fees.fastest);
      const plan = planBtcSend({ utxos: d.utxos, to: key.address, amount: sats + reserve, feeRate: d.fees.halfHour, changeAddress: wallet.bitcoinAddress });
      setReview({ key, sats, reserve, plan });
    } catch (err) {
      const m = (err as Error).message || "";
      setError(/fondos_insuficientes|sin_fondos/.test(m) ? "No te alcanza para ese monto más las comisiones." : m && !/_/.test(m) ? m : "No se pudo cotizar. Intenta de nuevo.");
    } finally { setBusy(""); }
  }

  async function confirm() {
    if (!wallet || !review || !userId || busy) return;
    setError("");
    const saved: Saved = { token: review.key.token, address: review.key.address, sats: review.sats, note: note.trim(), createdAt: new Date().toISOString() };
    // La llave se guarda ANTES de mover dinero: si se cierra la página, no se pierde.
    const list = [saved, ...readLinks(userId)];
    writeLinks(userId, list);
    if (!readLinks(userId).some(l => l.token === saved.token)) { setError("Este navegador no deja guardar datos (modo privado). Sin eso no podrías recuperar el link. Usa una ventana normal."); return; }
    try {
      const signer = await import("@/lib/send/signer");
      const unsigned = buildBtcUnsigned(review.plan, wallet.bitcoinAddress);
      setBusy("firmando");
      const sigs = await signer.signBitcoinHashes(wallet.organizationId, wallet.bitcoinAddress, unsigned.sighashes);
      const done = finalizeBtc(unsigned, sigs);
      setBusy("transmitiendo");
      const r = await fetch("/api/send/btc/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hex: done.hex }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "La red no aceptó el envío.");
      saved.fundTxid = d.txid;
      const next = [saved, ...readLinks(userId).filter(l => l.token !== saved.token)];
      writeLinks(userId, next); setLinks(next); setCreated(saved); setReview(null); setAmount(""); setNote("");
    } catch (err) {
      // El fondeo falló: el link no tiene dinero, se quita de la lista.
      const next = readLinks(userId).filter(l => l.token !== saved.token);
      writeLinks(userId, next); setLinks(next);
      const m = (err as Error).message || "";
      setError(m === "dispositivo_no_autorizado" ? "Este dispositivo no puede firmar. Usa el dispositivo donde activaste tu wallet." : m && !/_/.test(m) ? m : "No se pudo enviar. No se movió dinero.");
    } finally { setBusy(""); }
  }

  async function recover(l: Saved) {
    if (!wallet || !userId || recovering) return;
    setRecovering(l.address); setError("");
    try {
      const key = parseLinkToken(l.token)!;
      const s = await fetch(`/api/claim/${l.address}`, { cache: "no-store" }).then(r => r.json()) as LinkStatus;
      if (s.status !== "disponible") throw new Error(s.status === "reclamado" ? "Ya lo reclamaron." : "El link todavía no tiene saldo confirmado en la red.");
      const signed = sweepLink(key, s.utxos, wallet.bitcoinAddress, s.unconfirmed ? s.fees.fastest : s.fees.economy);
      const r = await fetch("/api/claim/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hex: signed.hex }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "La red no aceptó la recuperación.");
      const next = readLinks(userId).map(x => x.token === l.token ? { ...x, recoveredTxid: d.txid } : x);
      writeLinks(userId, next); setLinks(next);
    } catch (err) { setError((err as Error).message || "No se pudo recuperar."); }
    finally { setRecovering(""); }
  }

  async function share(l: Saved) {
    const url = linkUrl(window.location.origin, l.token);
    const text = waText(url, l.sats, l.note);
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelado */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }
  async function copy(l: Saved) {
    try { await navigator.clipboard.writeText(linkUrl(window.location.origin, l.token)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignora */ }
  }

  if (boot === "cargando") return <div className="snd-skeleton" aria-label="Cargando" />;
  if (boot === "sin-sesion") return (
    <div className="snd-gate">
      <p>Manda Bitcoin por WhatsApp a quien sea. La otra persona no necesita cuenta: abre el link, pega su dirección de Bitcoin y le llega. Para crear links necesitas tu cuenta.</p>
      <PressButton href="/login?redirect_url=/send/link">Inicia sesión para crear un link</PressButton>
    </div>
  );
  if (boot === "sin-wallet") return <div className="snd-gate"><p>Primero activa tu wallet.</p><PressButton href="/profile">Activar mi wallet</PressButton></div>;
  if (boot === "error" || !wallet) return <p className="field-error" role="alert">No pudimos cargar tu wallet. Recarga la página.</p>;

  const list = (
    links.length > 0 && (
      <section className="lnk-list" aria-label="Mis links">
        <h3>Mis links</h3>
        <p className="snd-foot">Se guardan en este dispositivo. Si borras los datos del navegador, un link sin reclamar solo se recupera abriéndolo tú mismo.</p>
        {links.map(l => {
          const s = statuses[l.address];
          const st = l.recoveredTxid ? "recuperado" : s === "error" || !s ? "…" : s.status === "disponible" ? "sin reclamar" : s.status === "reclamado" ? "reclamado" : "fondeando";
          return (
            <div key={l.token} className="lnk-item">
              <div><strong>{satsToBtc(l.sats)} BTC</strong><small>{new Date(l.createdAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}{l.note ? ` · ${l.note}` : ""}</small></div>
              <span className={`lnk-badge ${st.replace(" ", "-")}`}>{st}</span>
              {st === "sin reclamar" && (
                <div className="lnk-actions">
                  <button type="button" onClick={() => share(l)}>Compartir</button>
                  <button type="button" onClick={() => recover(l)} disabled={Boolean(recovering)}>{recovering === l.address ? "Recuperando…" : "Recuperar"}</button>
                </div>
              )}
            </div>
          );
        })}
      </section>
    )
  );

  if (created) return (
    <div className="form-stack">
      <div className="snd-done pendiente">
        <div className="snd-done-orb" aria-hidden="true">✓</div>
        <h2>Link listo</h2>
        <p className="snd-done-amt">{satsToBtc(created.sats)} BTC</p>
        <p className="snd-done-note">Mándalo por WhatsApp. Quien lo abra pega su dirección de Bitcoin y le llega. Se puede reclamar desde ya; el saldo se confirma en la red en 10 a 30 minutos.</p>
      </div>
      <PressButton onClick={() => share(created)}>Enviar por WhatsApp</PressButton>
      <PressButton variant="secondary" onClick={() => copy(created)}>{copied ? "Copiado" : "Copiar link"}</PressButton>
      <p className="rcv-warn">Trátalo como efectivo: quien tenga el link, cobra. Mándalo solo a esa persona.</p>
      <PressButton variant="ghost" onClick={() => setCreated(null)}>Crear otro link</PressButton>
      {list}
    </div>
  );

  if (review) {
    const total = review.plan.amount + review.plan.fee;
    return (
      <div className="form-stack">
        <div className="snd-hero"><span>Quien lo abra recibe</span><strong>{satsToBtc(review.sats)} BTC</strong><small>Sin cuenta, en su dirección de Bitcoin</small></div>
        <div className="summary-panel">
          <SummaryRow label="Comisión de envío" value={`${review.plan.fee.toLocaleString("es-MX")} sats`} />
          <SummaryRow label="Comisión del reclamo (ya incluida)" value={`${review.reserve.toLocaleString("es-MX")} sats`} />
          <SummaryRow label="Sale de tu wallet" value={<strong>{satsToBtc(total)} BTC</strong>} />
          {note && <SummaryRow label="Mensaje" value={note} />}
        </div>
        <p className="rcv-warn">Quien tenga el link, cobra. Si nadie lo reclama, lo recuperas desde "Mis links".</p>
        {error && <p role="alert" className="field-error">{error}</p>}
        {deviceOk === false && <p role="alert" className="field-error">Este dispositivo no puede firmar. Usa el dispositivo donde activaste tu wallet.</p>}
        <PressButton onClick={confirm} disabled={Boolean(busy) || deviceOk === false}>
          {busy === "firmando" ? "Firmando en tu dispositivo…" : busy === "transmitiendo" ? "Fondeando el link…" : "Crear link"}
        </PressButton>
        <PressButton variant="secondary" onClick={() => setReview(null)} disabled={Boolean(busy)}>Editar</PressButton>
      </div>
    );
  }

  return (
    <form className="form-stack" onSubmit={quote} noValidate>
      <label className="amount-field">
        <span>Monto a enviar</span>
        <div>
          <input inputMode="decimal" autoComplete="off" aria-label="Monto en BTC" value={amount}
            onChange={e => { setAmount(e.target.value.replace(/[^0-9.,]/g, "")); setError(""); }} placeholder="0.0001" />
          <strong className="currency-label">BTC</strong>
        </div>
      </label>
      <div className="snd-row"><span>Disponible: {available == null ? "—" : satsToBtc(available)} BTC</span></div>
      <label className="field-label">
        Mensaje (opcional)
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={80} placeholder="Ej. Tu pago de la semana" />
      </label>
      {error && <p role="alert" className="field-error">{error}</p>}
      <PressButton type="submit" disabled={busy === "cotizando"}>{busy === "cotizando" ? "Cotizando…" : "Revisar link"}</PressButton>
      <p className="snd-foot">Sale Bitcoin de tu wallet hacia el link, y del link a la dirección que ponga quien lo reciba. Bitcoin a Bitcoin, sin intermediarios.</p>
      {list}
    </form>
  );
}

export function LinkCreate() {
  if (!authConfigured) return <div className="snd-gate"><p>Para crear links necesitas tu cuenta.</p><PressButton href="/login">Iniciar sesión</PressButton></div>;
  return <Inner />;
}
