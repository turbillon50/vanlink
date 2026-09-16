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
  { href: "/vanlink", label: "VanLink", icon: "link" },
  { href: "/activity", label: "Actividad", icon: "activity" },
  { href: "/v", label: "V", icon: "spark" },
];
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
  const pathname = usePathname(),
    dialog = useRef<HTMLDialogElement>(null),
    [keyboard, setKeyboard] = useState(false);
  const active = navigation.findIndex((n) =>
    n.href === "/"
      ? pathname === "/"
      : pathname === n.href || pathname.startsWith(n.href + "/"),
  );
  useEffect(() => {
    const v = window.visualViewport;
    const update = () =>
      setKeyboard(Boolean(v && window.innerHeight - v.height > 150));
    v?.addEventListener("resize", update);
    return () => v?.removeEventListener("resize", update);
  }, []);
  const items = [
    ...navigation,
    { href: "/profile", label: "Mi cuenta", icon: "user" as const },
    { href: "/welcome", label: "Conoce VanDeFi", icon: "globe" as const },
  ];
  return (
    <MenuContext.Provider value={() => dialog.current?.showModal()}>
      <div className="app-root" data-keyboard={keyboard}>
        <a className="skip-link" href="#main">
          Ir al contenido
        </a>
        <aside className="desktop-rail">
          <Link href="/" aria-label="VanDeFi, inicio">
            <Wordmark size={30} />
          </Link>
          <p className="rail-label">TU DINERO. TU CONTROL.</p>
          <nav aria-label="Navegación principal">
            {items.slice(0, 6).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname === n.href ? "page" : undefined}
                className={
                  (
                    n.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(n.href)
                  )
                    ? "rail-link active"
                    : "rail-link"
                }
              >
                <Icon name={n.icon} />
                {n.label}
                <Icon name="chevron" size={15} />
              </Link>
            ))}
          </nav>
          <div className="rail-bottom">
            <span className="network-label">
              <i />
              USDC en Base
            </span>
            <p>
              Todo empieza con
              <br />
              un simple link.
            </p>
            <AccountLink rail />
          </div>
        </aside>
        <div className="workspace">
          <main
            id="main"
            className={wide ? "page-content wide-page" : "page-content"}
          >
            {children}
          </main>
        </div>
        <nav
          className="dock-wrap"
          aria-label="Navegación móvil"
          data-vulcano-bottomnav
        >
          <div className="dock">
            <span
              aria-hidden="true"
              className="dock-selection"
              style={{
                transform: "translateX(" + Math.max(active, 0) * 100 + "%)",
                opacity: active < 0 ? 0 : 1,
              }}
            />
            {navigation.map((n, i) => (
              <Link
                href={n.href}
                key={n.href}
                aria-current={active === i ? "page" : undefined}
                className={active === i ? "dock-item selected" : "dock-item"}
              >
                <Icon name={n.icon} size={n.label === "V" ? 20 : 22} />
                <span>{n.label}</span>
              </Link>
            ))}
          </div>
        </nav>
        <dialog
          ref={dialog}
          className="menu-dialog"
          aria-labelledby="menu-title"
          onClick={(e) => {
            if (e.target === dialog.current) dialog.current?.close();
          }}
        >
          <div className="menu-body">
            <div className="section-heading">
              <h2 id="menu-title">
                <Wordmark size={28} />
              </h2>
              <button
                className="icon-button"
                aria-label="Cerrar menú"
                onClick={() => dialog.current?.close()}
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="eyebrow">Todo, a la mano</p>
            <nav aria-label="Menú">
              {items.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="menu-row"
                  onClick={() => dialog.current?.close()}
                >
                  <Icon name={n.icon} />
                  <span>{n.label}</span>
                  <Icon name="chevron" size={17} />
                </Link>
              ))}
            </nav>
            <span className="network-label">
              <i />
              USDC · Base
            </span>
          </div>
        </dialog>
      </div>
    </MenuContext.Provider>
  );
}
