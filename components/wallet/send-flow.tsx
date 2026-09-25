"use client";

/**
 * components/wallet/send-flow.tsx — Enviar de verdad.
 *
 * Bitcoin nativo y Base (USDC, USDT, cbBTC, ETH). El orden es siempre:
 *   formulario → cotización real → revisión → firma en ESTE navegador → red → seguimiento.
 * El servidor solo lee la red y transmite; la firma sale de la llave del
 * dispositivo vía Turnkey. Antes de transmitir se verifica que la firma sea de
 * tu wallet y que el contenido no cambió.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { PressButton } from "@/components/ui/press-button";
import { SummaryRow } from "@/components/craft";
import { authConfigured } from "@/lib/auth-config";
import {
  btcToSats, buildBtcUnsigned, finalizeBtc, isValidBtcAddress, planBtcSend, satsToBtc,
  type BtcFeeRates, type BtcPlan, type Utxo,
} from "@/lib/send/bitcoin-tx";
import {
  BASE_ASSETS, buildBaseUnsigned, fromUnits, maxGasCost, normalizeEvmAddress, toUnits, verifyBaseSigned,
  type BaseAsset, type BaseQuote,
} from "@/lib/send/base-tx";

type Network = "bitcoin" | "base";
type Asset = "BTC" | BaseAsset;
type WalletInfo = { organizationId: string; turnkeyUserId: string; evmAddress: string; bitcoinAddress: string };
type Speed = "fastest" | "halfHour" | "economy";
type Prices = { BTC?: number; ETH?: number };

type Review =
  | { network: "bitcoin"; plan: BtcPlan; fees: BtcFeeRates; utxos: Utxo[] }
  | { network: "base"; asset: BaseAsset; to: string; value: bigint; quote: BaseQuote; unsigned: `0x${string}`; gasCost: bigint };

type Sent = { network: Network; id: string; explorer: string; label: string };

const SPEEDS: { id: Speed; label: string; eta: string }[] = [
  { id: "fastest", label: "Rápida", eta: "~10 min" },
  { id: "halfHour", label: "Normal", eta: "~30 min" },
  { id: "economy", label: "Económica", eta: "horas" },
];

const ERRORS: Record<string, string> = {
  fondos_insuficientes: "No te alcanza para ese monto más la comisión.",
  fondos_insuficientes_para_comision: "Tu saldo no alcanza ni para la comisión de la red.",
  monto_bajo_polvo: "Bitcoin no permite enviar montos tan pequeños (mínimo 294 sats).",
  sin_fondos: "No tienes BTC confirmado para enviar.",
  dispositivo_no_autorizado: "Este dispositivo no está autorizado para firmar. Entra desde el dispositivo donde activaste tu wallet.",
  requiere_aprobacion: "La firma quedó esperando una aprobación extra. No se envió nada.",
  llave_no_corresponde_a_origen: "La firma no corresponde a tu dirección. No se envió nada.",
  remitente_no_coincide: "La firma no corresponde a tu wallet. No se envió nada.",
};
const human = (e: unknown) => {
  const m = (e as Error)?.message || "";
  if (ERRORS[m]) return ERRORS[m];
  if (m.startsWith("firma_altero")) return "La transacción firmada no coincide con la que revisaste. No se envió nada.";
  if (/network|fetch|Failed to fetch/i.test(m)) return "Sin conexión. Revisa tu internet e intenta de nuevo.";
  return m && m.length < 140 && !/_/.test(m) ? m : "No se pudo completar. No se movió dinero.";
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { message?: string; error?: string }).message || (data as { error?: string }).error || "error");
  return data as T;
}

const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "" : `≈ $${n < 0.01 && n > 0 ? n.toFixed(4) : n.toLocaleString("es-MX", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} USD`;
const short = (a: string) => (a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a);
const chunk = (a: string) => a.replace(/(.{4})/g, "$1 ").trim();

function priceOf(asset: Asset, p: Prices): number | null {
  if (asset === "USDC" || asset === "USDT") return 1;
  if (asset === "BTC" || asset === "cbBTC") return p.BTC ?? null;
  if (asset === "ETH") return p.ETH ?? null;
  return null;
}

function SendFlowInner() {
  const { isLoaded, userId } = useAuth();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [boot, setBoot] = useState<"cargando" | "sin-sesion" | "sin-wallet" | "listo" | "error">("cargando");
  const [deviceOk, setDeviceOk] = useState<boolean | null>(null);
  const [prices, setPrices] = useState<Prices>({});
  const [balances, setBalances] = useState<Partial<Record<Asset, string>>>({});

  const [network, setNetwork] = useState<Network>("bitcoin");
  const [asset, setAsset] = useState<Asset>("BTC");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [speed, setSpeed] = useState<Speed>("halfHour");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "cotizando" | "firmando" | "transmitiendo">("");
  const [review, setReview] = useState<Review | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [status, setStatus] = useState<"pendiente" | "confirmada" | "fallida">("pendiente");
  const inFlight = useRef(false);

  // Arranque: wallet, dispositivo, saldos y precios.
  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) { setBoot("sin-sesion"); return; }
    let alive = true;
    void (async () => {
      try {
        const w = await api<{ wallet: WalletInfo | null }>("/api/wallet");
        if (!alive) return;
        if (!w.wallet) { setBoot("sin-wallet"); return; }
        setWallet(w.wallet); setBoot("listo");
        const { verifyWalletDevice } = await import("@/lib/wallet/browser");
        const ok = await verifyWalletDevice(userId, w.wallet.organizationId, w.wallet.turnkeyUserId).catch(() => false);
        if (alive) setDeviceOk(ok);
      } catch { if (alive) setBoot("error"); }
    })();
    void api<{ quotes: { symbol: string; price: number }[] }>("/api/market").then(d => {
      if (!alive) return;
      const p: Prices = {}; for (const q of d.quotes) if (q.symbol === "BTC" || q.symbol === "ETH") p[q.symbol] = q.price;
      setPrices(p);
    }).catch(() => {});
    return () => { alive = false; };
  }, [isLoaded, userId]);

  const loadBalances = useCallback(async () => {
    try {
      const d = await api<{ base?: { balances: { token?: string; amount?: string }[] }; bitcoin?: { amount?: string } }>("/api/chain/balance");
      const b: Partial<Record<Asset, string>> = {};
      for (const x of d.base?.balances ?? []) if (x.token && x.amount != null) b[x.token as Asset] = x.amount;
      if (d.bitcoin?.amount != null) b.BTC = d.bitcoin.amount;
      setBalances(b);
    } catch { /* se muestran guiones */ }
  }, []);
  useEffect(() => { if (boot === "listo") void loadBalances(); }, [boot, loadBalances]);

  // Seguimiento de la transacción enviada.
  useEffect(() => {
    if (!sent || status !== "pendiente") return;
    const t = setInterval(async () => {
      try {
        const s = await api<{ confirmed: boolean; failed?: boolean }>(`/api/send/status?network=${sent.network}&id=${sent.id}`);
        if (s.failed) setStatus("fallida");
        else if (s.confirmed) { setStatus("confirmada"); void loadBalances(); }
      } catch { /* reintenta en el siguiente ciclo */ }
    }, sent.network === "base" ? 3_000 : 20_000);
    return () => clearInterval(t);
  }, [sent, status, loadBalances]);

  const pickNetwork = (n: Network) => {
    setNetwork(n); setAsset(n === "bitcoin" ? "BTC" : "USDC"); setError(""); setIsMax(false); setAmount("");
  };

  // Detecta dirección de la otra red y lo dice antes de que el usuario la riegue.
  const addressHint = useMemo(() => {
    const v = to.trim();
    if (!v) return "";
    if (network === "bitcoin" && /^0x/i.test(v)) return "Esa es una dirección de Base, no de Bitcoin.";
    if (network === "base" && (/^bc1/i.test(v) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(v))) return "Esa es una dirección de Bitcoin, no de Base.";
    const ok = network === "bitcoin" ? isValidBtcAddress(v) : Boolean(normalizeEvmAddress(v));
    return ok ? "" : "Dirección incompleta o inválida.";
  }, [to, network]);
  const ownAddress = wallet && to.trim().toLowerCase() === (network === "bitcoin" ? wallet.bitcoinAddress : wallet.evmAddress).toLowerCase();

  const price = priceOf(asset, prices);
  const amountNum = Number(amount.replace(",", "."));
  const amountUsd = !isMax && price && amountNum > 0 ? usd(amountNum * price) : "";

  async function paste() {
    try { const t = await navigator.clipboard.readText(); if (t) setTo(t.trim()); } catch { setError("Tu navegador no dejó leer el portapapeles. Pega la dirección a mano."); }
  }

  async function quote(e?: React.FormEvent) {
    e?.preventDefault();
    if (!wallet || inFlight.current) return;
    setError("");
    const dest = to.trim();
    if (addressHint) { setError(addressHint); return; }
    if (!dest) { setError("Escribe la dirección de destino."); return; }
    if (ownAddress) { setError("Esa es tu propia dirección."); return; }
    inFlight.current = true; setBusy("cotizando");
    try {
      if (network === "bitcoin") {
        const sats = isMax ? "max" as const : btcToSats(amount);
        if (sats === null) throw new Error("Escribe un monto válido en BTC (hasta 8 decimales).");
        const d = await api<{ utxos: Utxo[]; fees: BtcFeeRates }>("/api/send/btc/prepare");
        const plan = planBtcSend({ utxos: d.utxos, to: dest, amount: sats, feeRate: d.fees[speed], changeAddress: wallet.bitcoinAddress });
        setReview({ network: "bitcoin", plan, fees: d.fees, utxos: d.utxos });
      } else {
        const a = asset as BaseAsset;
        const destN = normalizeEvmAddress(dest)!;
        let value: bigint | null;
        if (isMax) {
          // Primero cotiza con 1 unidad para conocer saldo y gas; luego calcula el máximo real.
          const probe = await api<{ assetBalance: string; quote: BaseQuote }>(`/api/send/base/prepare?asset=${a}&to=${destN}&value=1`);
          const bal = BigInt(probe.assetBalance);
          value = a === "ETH" ? bal - maxGasCost(probe.quote) : bal;
          if (value <= BigInt(0)) throw new Error(a === "ETH" ? "Tu ETH no alcanza ni para la comisión." : `No tienes ${a} para enviar.`);
        } else {
          value = toUnits(amount, a);
          if (!value) throw new Error(`Escribe un monto válido en ${a} (hasta ${BASE_ASSETS[a].decimals} decimales).`);
        }
        const d = await api<{ assetBalance: string; quote: BaseQuote }>(`/api/send/base/prepare?asset=${a}&to=${destN}&value=${value}`);
        const gasCost = maxGasCost(d.quote);
        const eth = BigInt(d.quote.ethBalance);
        const needEth = gasCost + (a === "ETH" ? value : BigInt(0));
        if (eth < needEth) {
          throw new Error(a === "ETH"
            ? "No te alcanza para el monto más la comisión."
            : `Para mover ${a} en Base necesitas un poco de ETH para la comisión (máx. ${Number(fromUnits(gasCost, "ETH")).toFixed(7)} ETH ${usd(Number(fromUnits(gasCost, "ETH")) * (prices.ETH ?? 0))}). Recíbelo en tu misma dirección de Base.`);
        }
        const { unsigned } = buildBaseUnsigned({ asset: a, to: destN, value, quote: d.quote });
        setReview({ network: "base", asset: a, to: destN, value, quote: d.quote, unsigned, gasCost });
      }
    } catch (err) { setError(human(err)); }
    finally { inFlight.current = false; setBusy(""); }
  }

  // Cambiar la velocidad en la revisión recotiza con los mismos UTXOs.
  function changeSpeed(s: Speed) {
    setSpeed(s);
    if (review?.network !== "bitcoin" || !wallet) return;
    try {
      const plan = planBtcSend({ utxos: review.utxos, to: review.plan.to, amount: isMax ? "max" : review.plan.amount,
        feeRate: review.fees[s], changeAddress: wallet.bitcoinAddress });
      setReview({ ...review, plan }); setError("");
    } catch (err) { setError(human(err)); }
  }

  async function confirm() {
    if (!wallet || !review || inFlight.current) return;
    inFlight.current = true; setError("");
    try {
      const signer = await import("@/lib/send/signer");
      if (review.network === "bitcoin") {
        const unsigned = buildBtcUnsigned(review.plan, wallet.bitcoinAddress);
        setBusy("firmando");
        const sigs = await signer.signBitcoinHashes(wallet.organizationId, wallet.bitcoinAddress, unsigned.sighashes);
        const done = finalizeBtc(unsigned, sigs);
        setBusy("transmitiendo");
        const r = await api<{ txid: string; explorer: string }>("/api/send/btc/broadcast", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hex: done.hex }) });
        setSent({ network: "bitcoin", id: r.txid, explorer: r.explorer, label: `${satsToBtc(review.plan.amount)} BTC` });
      } else {
        setBusy("firmando");
        const raw = await signer.signBaseTransaction(wallet.organizationId, wallet.evmAddress, review.unsigned);
        const signed = await verifyBaseSigned(raw, { from: wallet.evmAddress, unsigned: review.unsigned });
        setBusy("transmitiendo");
        const r = await api<{ hash: string; explorer: string }>("/api/send/base/broadcast", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signed }) });
        setSent({ network: "base", id: r.hash, explorer: r.explorer, label: `${fromUnits(review.value, review.asset)} ${review.asset}` });
      }
      setStatus("pendiente"); setReview(null);
    } catch (err) { setError(human(err)); }
    finally { inFlight.current = false; setBusy(""); }
  }

  function reset() { setSent(null); setReview(null); setTo(""); setAmount(""); setIsMax(false); setError(""); }

  /* ---------------- vistas ---------------- */

  if (boot === "cargando") return <div className="snd-skeleton" aria-label="Cargando" />;
  if (boot === "sin-wallet") return (
    <div className="snd-gate">
      <p>Todavía no activas tu wallet. Se hace una sola vez, desde tu cuenta.</p>
      <PressButton href="/profile">Activar mi wallet</PressButton>
    </div>
  );
  const guest = boot === "sin-sesion";
  if (boot === "error" || (!wallet && !guest)) return <p className="field-error" role="alert">No pudimos cargar tu wallet. Recarga la página.</p>;

  if (sent && wallet) {
    const icon = status === "confirmada" ? "✓" : status === "fallida" ? "!" : "";
    return (
      <div className={`snd-done ${status}`}>
        <div className="snd-done-orb" aria-hidden="true">{icon || <span className="snd-spin" />}</div>
        <h2>{status === "confirmada" ? "Enviado y confirmado" : status === "fallida" ? "La red la rechazó" : "Enviado a la red"}</h2>
        <p className="snd-done-amt">{sent.label}</p>
        <p className="snd-done-note">
          {status === "pendiente" && (sent.network === "bitcoin"
            ? "Bitcoin confirma por bloques. Suele tardar de 10 a 30 minutos; puedes cerrar esta pantalla."
            : "Base confirma en segundos.")}
          {status === "confirmada" && "Ya está en la cadena. Es definitivo."}
          {status === "fallida" && "La transacción se incluyó pero falló. Se cobró la comisión; el monto no salió."}
        </p>
        <code className="snd-txid">{short(sent.id)}</code>
        <div className="snd-actions">
          <PressButton href={sent.explorer} variant="secondary" target="_blank" rel="noopener noreferrer">Ver en el explorador</PressButton>
          <PressButton onClick={reset}>Hacer otro envío</PressButton>
        </div>
        <Link href="/activity" className="snd-link">Ir a mi actividad</Link>
      </div>
    );
  }

  if (review && wallet) {
    const isBtc = review.network === "bitcoin";
    const amt = isBtc ? Number(satsToBtc(review.plan.amount)) : Number(fromUnits(review.value, review.asset));
    const a: Asset = isBtc ? "BTC" : review.asset;
    const p = priceOf(a, prices);
    const feeNative = isBtc ? review.plan.fee / 1e8 : Number(fromUnits(review.gasCost, "ETH"));
    const feePrice = isBtc ? prices.BTC : prices.ETH;
    const dest = isBtc ? review.plan.to : review.to;
    return (
      <div className="form-stack">
        <div className="snd-hero">
          <span>Vas a enviar</span>
          <strong>{isBtc ? satsToBtc(review.plan.amount) : fromUnits(review.value, review.asset)} {a}</strong>
          <small>{p ? usd(amt * p) : ""}</small>
        </div>
        <div className="summary-panel">
          <SummaryRow label="Para" value={<code className="snd-addr">{chunk(dest)}</code>} />
          <SummaryRow label="Red" value={isBtc ? "Bitcoin" : "Base"} />
          <SummaryRow label={isBtc ? "Comisión de la red" : "Comisión máxima"} value={
            <>{isBtc ? `${review.plan.fee.toLocaleString("es-MX")} sats` : `${feeNative.toFixed(8)} ETH`}<br /><small>{feePrice ? usd(feeNative * feePrice) : ""}</small></>
          } />
          {isBtc && review.plan.change > 0 && <SummaryRow label="Regresa a tu wallet" value={`${satsToBtc(review.plan.change)} BTC`} />}
          {isBtc && <SummaryRow label="Llegada estimada" value={SPEEDS.find(s => s.id === speed)!.eta} />}
          {!isBtc && <SummaryRow label="Llegada estimada" value="segundos" />}
        </div>
        {isBtc && (
          <div className="rcv-tabs" role="radiogroup" aria-label="Velocidad">
            {SPEEDS.map(s => (
              <button key={s.id} type="button" role="radio" aria-checked={speed === s.id}
                className={speed === s.id ? "rcv-tab active" : "rcv-tab"} onClick={() => changeSpeed(s.id)} disabled={Boolean(busy)}>
                {s.label} · {review.fees[s.id]} sat/vB
              </button>
            ))}
          </div>
        )}
        <p className="rcv-warn">Los envíos en la cadena no se pueden cancelar ni revertir. Verifica la dirección carácter por carácter.</p>
        {error && <p role="alert" className="field-error">{error}</p>}
        {deviceOk === false && <p role="alert" className="field-error">{ERRORS.dispositivo_no_autorizado}</p>}
        <PressButton onClick={confirm} disabled={Boolean(busy) || deviceOk === false}>
          {busy === "firmando" ? "Firmando en tu dispositivo…" : busy === "transmitiendo" ? "Enviando a la red…" : "Confirmar y enviar"}
        </PressButton>
        <PressButton variant="secondary" onClick={() => { setReview(null); setError(""); }} disabled={Boolean(busy)}>Editar</PressButton>
      </div>
    );
  }

  const available = balances[asset];
  const assets: Asset[] = network === "bitcoin" ? ["BTC"] : ["USDC", "USDT", "cbBTC", "ETH"];
  return (
    <form className="form-stack" onSubmit={quote} noValidate>
      <div className="rcv-tabs" role="tablist" aria-label="Red">
        {(["bitcoin", "base"] as Network[]).map(n => (
          <button key={n} type="button" role="tab" aria-selected={network === n}
            className={network === n ? "rcv-tab active" : "rcv-tab"} onClick={() => pickNetwork(n)}>
            {n === "bitcoin" ? "Bitcoin" : "Base"}
          </button>
        ))}
      </div>
      {network === "base" && (
        <div className="snd-assets" role="radiogroup" aria-label="Activo">
          {assets.map(x => (
            <button key={x} type="button" role="radio" aria-checked={asset === x}
              className={asset === x ? "snd-asset active" : "snd-asset"} onClick={() => { setAsset(x); setIsMax(false); setAmount(""); setError(""); }}>
              {x}<small>{balances[x] ?? "—"}</small>
            </button>
          ))}
        </div>
      )}

      <label className="field-label">
        Dirección de destino
        <div className="snd-addr-field">
          <input value={to} onChange={e => { setTo(e.target.value); setError(""); }}
            placeholder={network === "bitcoin" ? "bc1… , 1… o 3…" : "0x…"}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" inputMode="text" />
          <button type="button" className="snd-paste" onClick={paste}>Pegar</button>
        </div>
      </label>
      {to && addressHint && <p className="snd-hint">{addressHint}</p>}
      {ownAddress && <p className="snd-hint">Esa es tu propia dirección.</p>}

      <label className="amount-field">
        <span>Monto</span>
        <div>
          <input inputMode="decimal" autoComplete="off" aria-label="Monto"
            value={isMax ? "Todo mi saldo" : amount} readOnly={isMax}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0.00" />
          <strong className="currency-label">{asset}</strong>
        </div>
      </label>
      <div className="snd-row">
        <span>Disponible: {available ?? "—"} {asset}{amountUsd && <em> · {amountUsd}</em>}</span>
        <button type="button" className={isMax ? "snd-max active" : "snd-max"} onClick={() => { setIsMax(!isMax); setAmount(""); }}>
          {isMax ? "Quitar máximo" : "Máximo"}
        </button>
      </div>

      {network === "bitcoin" && (
        <div className="rcv-tabs" role="radiogroup" aria-label="Velocidad">
          {SPEEDS.map(s => (
            <button key={s.id} type="button" role="radio" aria-checked={speed === s.id}
              className={speed === s.id ? "rcv-tab active" : "rcv-tab"} onClick={() => setSpeed(s.id)}>
              {s.label}<small className="snd-eta">{s.eta}</small>
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="field-error">{error}</p>}
      {deviceOk === false && <p className="snd-hint">Este dispositivo no puede firmar envíos. Puedes preparar el envío, pero firmarlo requiere el dispositivo donde activaste tu wallet.</p>}
      {guest
        ? <PressButton href="/login?redirect_url=/send">Inicia sesión para enviar</PressButton>
        : <PressButton type="submit" disabled={busy === "cotizando"}>{busy === "cotizando" ? "Cotizando la red…" : "Revisar envío"}</PressButton>}
      <p className="snd-foot">La comisión la cobra la red, no VanDeFi. Tú firmas desde este dispositivo; nadie más puede mover tu dinero.</p>
    </form>
  );
}

/** Sin Clerk configurado (builds locales) no hay sesión posible: se muestra la puerta de acceso. */
export function SendFlow() {
  if (!authConfigured) return (
    <div className="snd-gate">
      <p>Para enviar necesitas tu cuenta y tu wallet.</p>
      <PressButton href="/login">Iniciar sesión</PressButton>
    </div>
  );
  return <SendFlowInner />;
}
