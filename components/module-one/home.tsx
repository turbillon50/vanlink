"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Activity, ArrowRight, BookOpen, Link2, Menu, Send, Wallet, X } from "lucide-react";
import { Logo, Wordmark } from "@/components/brand/logo";
import { CreateVanLinkForm } from "@/components/vanlink/create-form";
import { ActivityList } from "@/components/wallet/activity-list";
import { authConfigured } from "@/lib/auth-config";
import { originFrom, panelFrom, panelPath, type Panel } from "@/lib/navigation/module-one";
import { rankRemittanceQuotes } from "@/lib/remittance/rail-policy";

const secondary = [
  { panel: "cartera", title: "Mi cartera", icon: Wallet },
  { panel: "actividad", title: "Actividad", icon: Activity },
  { panel: "guia", title: "Cómo funciona", icon: BookOpen },
] as const;

const titles = {
  menu: "Menú",
  guia: "Cómo funciona",
  enviar: "Enviar dinero",
  crear: "Crear VanLink",
  cartera: "Mi cartera",
  actividad: "Actividad",
};

const places = [
  { id: "MX", name: "México" },
  { id: "US", name: "Estados Unidos" },
  { id: "CO", name: "Colombia" },
  { id: "GT", name: "Guatemala" },
  { id: "VE", name: "Venezuela" },
] as const;

type PlaceId = (typeof places)[number]["id"];

function isPlace(value: unknown): value is PlaceId {
  return places.some((place) => place.id === value);
}

function RemittancePanel() {
  const [from, setFrom] = useState<PlaceId>("MX");
  const [to, setTo] = useState<PlaceId>("US");
  const [restored, setRestored] = useState(false);
  const [availability, setAvailability] = useState<"loading" | "paused" | "closed" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("vd-remit-intent") || "null") as { from?: unknown; to?: unknown } | null;
      if (isPlace(saved?.from)) setFrom(saved.from);
      if (isPlace(saved?.to)) setTo(saved.to);
    } catch { /* a broken draft must not block the panel */ }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem("vd-remit-intent", JSON.stringify({ from, to })); } catch { /* private mode */ }
  }, [from, to, restored]);

  useEffect(() => {
    const controller = new AbortController();
    setAvailability("loading");
    fetch("/api/polygon/availability", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("availability");
        const data = await response.json() as { network?: string; chainId?: number; asset?: string; sendEnabled?: boolean; receiveEnabled?: boolean };
        const known = data.network === "polygon" && data.chainId === 137 && data.asset === "USDT";
        if (!known) throw new Error("availability");
        const quotes = rankRemittanceQuotes({
          inputAsset: "USDT",
          inputAmount: "1",
          nowMs: Date.now(),
          allowedRails: ["polygon"],
          scope: "fiat-payout",
        }, []);
        if (quotes.length > 0) throw new Error("unexpected-route");
        setAvailability(data.sendEnabled === false && data.receiveEnabled === false ? "paused" : "closed");
      })
      .catch(() => { if (!controller.signal.aborted) setAvailability("error"); });
    return () => controller.abort();
  }, [attempt]);

  return (
    <form className="m-remit" onSubmit={(event) => event.preventDefault()}>
      <p>Elige de dónde sale y a dónde va. Aquí no hay cotización ni envío.</p>
      <label htmlFor="remit-from">Origen
        <select id="remit-from" value={from} onChange={(event) => { if (isPlace(event.target.value)) setFrom(event.target.value); }}>
          {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
        </select>
      </label>
      <label htmlFor="remit-to">Destino
        <select id="remit-to" value={to} onChange={(event) => { if (isPlace(event.target.value)) setTo(event.target.value); }}>
          {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
        </select>
      </label>
      <p role="status" className="m-status">
        {availability === "loading" && "Consultando disponibilidad."}
        {availability === "paused" && "No hay ruta disponible. USDT en Polygon está en pausa. La cotización y el envío llegan en un módulo posterior."}
        {availability === "closed" && "No hay ruta disponible para cotizar ni enviar. La cotización y el envío llegan en un módulo posterior."}
        {availability === "error" && "No pudimos consultar la disponibilidad."}
      </p>
      {availability === "error" && <button type="button" className="m-primary" onClick={() => setAttempt((n) => n + 1)}>Reintentar</button>}
    </form>
  );
}

function WalletSummary() {
  const [state, setState] = useState<{ status: "loading" | "empty" | "error" | "ready"; amount?: string; address?: string }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    async function load() {
      const r = await fetch("/api/chain/polygon", { signal: controller.signal, cache: "no-store" });
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (data.wallet === null) return setState({ status: "empty" });
      if (!data.wallet?.evmAddress || typeof data.polygon?.amount !== "string") throw new Error();
      setState({ status: "ready", address: data.wallet.evmAddress, amount: data.polygon.amount });
    }
    load().catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [attempt]);
  const confirmedZero = state.status === "ready" && Number(state.amount) === 0;
  return <div className="m-wallet" aria-live="polite">
    {state.status === "loading" && <p>Consultando</p>}
    {state.status === "empty" && <p>Esta cuenta no tiene una cartera vinculada. No se crea una cartera desde aquí.</p>}
    {state.status === "error" && <><p>No pudimos consultar el saldo.</p><button type="button" className="m-primary" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></>}
    {confirmedZero && <><small>Cero confirmado</small><h3>0 USDT</h3><p>Dirección de tu cartera</p><code>{state.address}</code><p>USDT en Polygon sigue en pausa. Esta consulta no mueve fondos.</p></>}
    {state.status === "ready" && !confirmedZero && <><small>Saldo confirmado</small><h3>{state.amount} USDT</h3><p>Dirección de tu cartera</p><code>{state.address}</code><p>USDT en Polygon sigue en pausa. Esta consulta no mueve fondos.</p></>}
  </div>;
}

function AccountPanel({ panel, path }: { panel: Panel; path: string }) {
  const [session, setSession] = useState<{ status: "loading" | "guest" | "ready" | "error"; id?: string }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      setSession({ status: "loading" });
      const r = await fetch("/api/account/session", { method: "POST", cache: "no-store", signal: controller.signal });
      if (r.status === 401) return setSession({ status: "guest" });
      if (!r.ok) throw new Error();
      const { userId } = await r.json();
      if (!userId) throw new Error();
      setSession({ status: "ready", id: userId });
    }
    check().catch(() => { if (!controller.signal.aborted) setSession({ status: "error" }); });
    return () => controller.abort();
  }, [attempt]);
  if (session.status === "loading") return <p role="status">Comprobando tu cuenta…</p>;
  if (session.status === "error") return <><p role="alert">No pudimos conectar con tu cuenta. Tu acción sigue guardada.</p><button type="button" className="m-primary" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></>;
  if (session.status === "guest") {
    const query = "?volver=" + encodeURIComponent(path);
    return <><p>{panel === "crear" ? "Entra para preparar tu enlace de cobro. Volverás a este formulario al terminar. Entrar no publica un cobro." : "Entra para consultar la información de tu cuenta."}</p>
      <div className="m-actions"><a className="m-primary" href={"/login" + query}>Entrar <ArrowRight size={17} /></a><a className="m-secondary" href={"/sign-up" + query}>Crear cuenta</a></div></>;
  }
  if (panel === "crear") return <CreateVanLinkForm key={session.id} owner={session.id} />;
  if (panel === "cartera") return <WalletSummary />;
  return <ActivityList filter="all" />;
}

function AccountBoundary(props: { panel: Panel; path: string }) {
  const { userId } = useAuth();
  return <AccountPanel key={userId || "guest"} {...props} />;
}

export function ModuleHome() {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [origin, setOrigin] = useState("/");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const fallback = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function sync() {
      const url = new URL(location.href);
      setPanel(panelFrom(url));
      setOrigin(originFrom(url));
    }
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    const el = dialog.current;
    if (!panel || !el) return;
    if (!el.open) el.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [panel]);
  function open(next: Panel) {
    const from = panel ? origin : originFrom(new URL(location.href));
    if (!panel) trigger.current = document.activeElement as HTMLElement;
    const path = panelPath(next, from);
    if (panel) history.replaceState(history.state, "", path);
    else history.pushState({ ...history.state, modulePanel: true }, "", path);
    setOrigin(from);
    setPanel(next);
  }
  function close() {
    dialog.current?.close();
    setPanel(null);
    if (history.state?.modulePanel) history.back();
    else if (new URL(origin, location.origin).pathname === "/") history.replaceState(history.state, "", origin);
    else router.replace(origin);
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : fallback.current)?.focus({ preventScroll: true }));
  }
  return <main className="m-home">
    <nav className="m-nav" aria-label="Principal">
      <a href="/" className="m-word"><Logo size={28} /><Wordmark size={22} /></a>
      <button className="m-round" ref={fallback} type="button" aria-label="Abrir menú" aria-expanded={panel === "menu"} onClick={() => open("menu")}><Menu size={22} /></button>
    </nav>
    <header className="m-stage">
      <h1>Envía dinero o cobra con un enlace.</h1>
      <div className="m-routes">
        <button type="button" className="m-route" onClick={() => open("enviar")}>
          <span className="m-mesh" aria-hidden="true" /><span className="m-luz" aria-hidden="true" /><span className="m-vidrio" aria-hidden="true" />
          <Send className="m-ico" aria-hidden="true" /><b>Enviar dinero</b>
        </button>
        <button type="button" className="m-route" onClick={() => open("crear")}>
          <span className="m-mesh" aria-hidden="true" /><span className="m-luz" aria-hidden="true" /><span className="m-vidrio" aria-hidden="true" />
          <Link2 className="m-ico" aria-hidden="true" /><b>Cobrar por enlace</b>
        </button>
      </div>
    </header>
    {panel && <dialog ref={dialog} className="m-sheet" aria-labelledby="m-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }}>
      <span className="m-handle" aria-hidden="true" />
      <header><h2 id="m-title">{titles[panel]}</h2><button className="m-round" type="button" aria-label="Cerrar panel" onClick={close}><X size={21} /></button></header>
      {panel === "menu" ? <div className="m-menu">{secondary.map(({ panel: id, title, icon: Icon }) => <button key={id} type="button" onClick={() => open(id)}><Icon size={19} />{title}<ArrowRight size={16} /></button>)}</div>
        : panel === "guia" ? <><p>Un VanLink es una solicitud de cobro que puedes compartir por mensaje.</p><ol><li>Elige la red, el importe y el concepto.</li><li>Revisa los datos antes de publicar tu enlace.</li><li>Quien lo recibe puede ver la solicitud y comprobar la red.</li></ol><p>Los cobros en USDT por Polygon están en pausa. Entrar no publica un cobro.</p><button type="button" className="m-primary" onClick={() => open("crear")}>Cobrar por enlace <ArrowRight size={17} /></button></>
        : panel === "enviar" ? <RemittancePanel />
        : authConfigured ? <AccountBoundary key={panel} panel={panel} path={panelPath(panel, origin)} /> : <p role="status">El acceso no está disponible en este momento. Puedes seguir explorando.</p>}
    </dialog>}
  </main>;
}
