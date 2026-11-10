"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Wordmark } from "@/components/brand/logo";
import { Icon, type IconName } from "@/components/icons";
import { AccountLink } from "@/components/auth/account-link";

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/market", label: "Mercado", icon: "chart" },
  { href: "/operate", label: "Operar", icon: "swap" },
  { href: "/activity", label: "Actividad", icon: "activity" },
  { href: "/profile", label: "Cuenta", icon: "user" },
];

const extraNavigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/cartera", label: "Otros activos", icon: "wallet" },
  { href: "/expert", label: "Mis tokens", icon: "wallet" },
  { href: "/vanx", label: "VANX", icon: "wallet" },
  { href: "/vanlink", label: "Mis VanLinks", icon: "link" },
  { href: "/v", label: "Asistente", icon: "chat" },
  { href: "/welcome", label: "Conoce VanDeFi", icon: "globe" },
];

function currentNav(pathname: string): number {
  if (pathname === "/" || pathname === "/cartera") return 0;
  if (pathname.startsWith("/market")) return 1;
  if (
    ["/operate", "/expert", "/up", "/down", "/send", "/receive", "/swap", "/buy", "/vanlink", "/vanx"]
      .some((route) => pathname === route || pathname.startsWith(route + "/"))
  ) return 2;
  if (pathname.startsWith("/activity")) return 3;
  if (pathname.startsWith("/profile")) return 4;
  return -1;
}

const MenuContext = createContext<(() => void) | null>(null);
export function useAppMenu() {
  return useContext(MenuContext);
}

export function AppShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const pathname = usePathname() || "/";
  const dialog = useRef<HTMLDialogElement>(null);
  const [keyboard, setKeyboard] = useState(false);
  const active = currentNav(pathname);
  const items = [...navigation, ...extraNavigation];

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setKeyboard(Boolean(viewport && window.innerHeight - viewport.height > 150));
    update();
    viewport?.addEventListener("resize", update);
    return () => viewport?.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <MenuContext.Provider value={() => dialog.current?.showModal()}>
      <div className="app-root" data-keyboard={keyboard}>
        <a className="skip-link" href="#main">Ir al contenido</a>
        <aside className="desktop-rail" aria-label="Menú de escritorio">
          <Link href="/" aria-label="VanDeFi, inicio">
            <Wordmark size={30} />
          </Link>
          <p className="rail-label">TU DINERO. TU CONTROL.</p>
          <nav aria-label="Navegación principal">
            {navigation.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                data-central={item.href === "/operate" ? "true" : undefined}
                aria-current={active === i ? "page" : undefined}
                className={active === i ? "rail-link active" : "rail-link"}
              >
                <Icon name={item.icon} />
                {item.label}
                <Icon name="chevron" size={15} />
              </Link>
            ))}
          </nav>
          <div className="rail-bottom">
            <span className="network-label"><i /> USDT · Polygon</span>
            <AccountLink rail />
          </div>
        </aside>

        <div className="workspace">
          <main id="main" className={wide ? "page-content wide-page" : "page-content"}>
            {children}
          </main>
        </div>

        <nav className="dock-wrap" aria-label="Navegación móvil" data-vulcano-bottomnav>
          <div className="dock">
            <span
              className="dock-selection"
              aria-hidden="true"
              style={{ transform: "translateX(" + Math.max(active, 0) * 100 + "%)", opacity: active < 0 ? 0 : 1 }}
            />
            {navigation.map((item, i) => (
              <Link
                href={item.href}
                key={item.href}
                aria-current={active === i ? "page" : undefined}
                className={active === i ? "dock-item selected" : "dock-item"}
              >
                <Icon name={item.icon} size={item.href === "/operate" ? 23 : 20} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        <dialog
          ref={dialog}
          className="menu-dialog"
          aria-labelledby="menu-title"
          onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}
        >
          <div className="menu-body">
            <div className="section-heading">
              <h2 id="menu-title"><Wordmark size={28} /></h2>
              <button type="button" className="icon-button" aria-label="Cerrar menú" onClick={() => dialog.current?.close()}>
                <Icon name="close" />
              </button>
            </div>
            <p className="eyebrow">Todo, a la mano</p>
            <nav aria-label="Menú completo">
              {items.map((item) => (
                <Link key={item.href} href={item.href} className="menu-row" onClick={() => dialog.current?.close()}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  <Icon name="chevron" size={17} />
                </Link>
              ))}
            </nav>
            <span className="network-label"><i /> USDT · Polygon</span>
          </div>
        </dialog>
      </div>
    </MenuContext.Provider>
  );
}
