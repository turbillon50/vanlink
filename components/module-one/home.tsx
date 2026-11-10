"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Activity, ArrowDownLeft, ArrowRight, BookOpen, Link2, Menu, Wallet, X } from "lucide-react";
import { Logo, Wordmark } from "@/components/brand/logo";
import { CreateVanLinkForm } from "@/components/vanlink/create-form";
import { ActivityList } from "@/components/wallet/activity-list";
import { authConfigured } from "@/lib/auth-config";
import { originFrom, panelFrom, panelPath, type Panel } from "@/lib/navigation/module-one";
import Rail from "./rail";

const choices = [
  { panel: "guia", title: "Cómo funciona", summary: "Conoce un VanLink", icon: BookOpen },
  { panel: "cartera", title: "Mi cartera", summary: "Dirección y saldo", icon: Wallet },
  { panel: "actividad", title: "Actividad", summary: "Consulta tus movimientos", icon: Activity },
] as const;
const titles = { menu: "Menú", guia: "Cómo funciona", crear: "Crear VanLink", cartera: "Mi cartera", actividad: "Actividad" };

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
  return <div className="m-wallet" aria-live="polite">
    {state.status === "loading" && <p>Consultando tu cartera y saldo…</p>}
    {state.status === "empty" && <p>Tu cuenta aún no tiene una cartera vinculada. Las altas están en pausa.</p>}
    {state.status === "error" && <><p>No pudimos consultar el saldo.</p><button onClick={() => setAttempt(n => n + 1)}>Reintentar</button></>}
    {state.status === "ready" && <><small>Saldo confirmado en Polygon</small><h3>{state.amount} USDT</h3><p>Dirección de tu cartera</p><code>{state.address}</code><p>Envíos y depósitos de USDT en Polygon en pausa.</p></>}
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
  if (session.status === "error") return <><p role="alert">No pudimos conectar con tu cuenta. Tu acción sigue guardada.</p><button className="m-primary" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></>;
  if (session.status === "guest") {
    const query = "?volver=" + encodeURIComponent(path);
    return <><p>{panel === "crear" ? "Entra para preparar tu enlace de cobro. Volverás aquí al terminar." : "Entra para consultar la información de tu cuenta."}</p>
      <div className="m-actions"><a className="m-primary" href={"/login" + query}>Entrar <ArrowRight size={17} /></a><a className="m-secondary" href={"/sign-up" + query}>Crear cuenta</a></div></>;
  }
  if (panel === "crear") return <CreateVanLinkForm key={session.id} owner={session.id} />;
  if (panel === "cartera") return <WalletSummary />;
  return <ActivityList filter="all" />;
}

function AccountBoundary(props: { panel: Panel; path: string }) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded) return <p role="status">Preparando el acceso…</p>;
  return <AccountPanel key={userId || "guest"} {...props} />;
}

// Portada/Hero and the capsule rail are adapted from turbillon50/vliving-2026.
// VanDeFi supplies its own destinations, typography, artwork and financial state.
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
  const menuItems = [{ panel: "crear", title: "Crear VanLink", icon: Link2 }, ...choices] as const;
  return <main className="m-home">
    <nav className="m-nav" aria-label="Principal"><a href="/" className="m-word"><Logo size={30} /><Wordmark /></a>
      <button className="m-round" ref={fallback} aria-label="Abrir menú" onClick={() => open("menu")}><Menu size={22} /></button></nav>
    <header className="m-hero"><div className="m-copy"><span className="m-kicker">CARTERA DIGITAL</span>
      <h1>Tu dinero,<br /><em>en un enlace.</em></h1>
      <p>Con VanDeFi puedes preparar un enlace de cobro y consultar tu cartera digital.</p>
      <div className="m-actions"><button className="m-primary" onClick={() => open("crear")}>Crear VanLink <ArrowRight size={17} /></button>
      <button className="m-secondary" onClick={() => open("guia")}>Cómo funciona</button></div></div>
      <div className="m-art" aria-hidden="true"><div className="m-halo" /><div className="m-medal"><Logo size={114}/></div></div></header>
    <section className="m-discover" aria-labelledby="explorar"><h2 id="explorar">Explorar</h2>
      <Rail className="m-rail">{choices.map(({panel: id,title,summary,icon: Icon})=><button key={id} className="m-tile" onClick={()=>open(id)}><Icon size={23}/><span><strong>{title}</strong><small>{summary}</small></span><ArrowDownLeft size={17}/></button>)}</Rail>
    </section>
    {panel && <dialog ref={dialog} className="m-sheet" aria-labelledby="m-title" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}}}>
      <header><h2 id="m-title">{titles[panel]}</h2><button className="m-round" aria-label="Cerrar panel" onClick={close}><X size={21}/></button></header>
      {panel === "menu" ? <div className="m-menu">{menuItems.map(({panel:id,title,icon:Icon})=><button key={id} onClick={()=>open(id)}><Icon size={19}/>{title}<ArrowRight size={16}/></button>)}</div>
       : panel === "guia" ? <><p>Un VanLink es una solicitud de cobro que puedes compartir por mensaje.</p><ol><li>Elige la red, el importe y el concepto.</li><li>Revisa los datos antes de publicar tu enlace.</li><li>Quien lo recibe puede ver la solicitud y comprobar la red.</li></ol><p>Los cobros en USDT por Polygon están en pausa.</p><button className="m-primary" onClick={()=>open("crear")}>Crear VanLink <ArrowRight size={17}/></button></>
       : authConfigured ? <AccountBoundary key={panel} panel={panel} path={panelPath(panel,origin)} /> : <p role="status">El acceso no está disponible en este momento.</p>}
    </dialog>}
  </main>;
}
