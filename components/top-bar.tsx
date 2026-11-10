"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { internalBackDestination, rememberInternalRoute, safeInternalPath, type InternalNavigation } from "@/lib/navigation/return-path";
import { Wordmark } from "@/components/brand/logo";
import { Icon } from "@/components/icons";
import { useAppMenu } from "@/components/app-shell";
import { AccountLink } from "@/components/auth/account-link";
// Client-only route memory; no cross-user or persistent storage.
let navigation: InternalNavigation = { current: null, previous: null };

export function TopBar({
  title,
  brand = false,
  backHref,
  returnToOrigin = false,
  right,
  lock = false,
}: {
  title?: string;
  brand?: boolean;
  /** Safe fallback when returnToOrigin is enabled; fixed destination otherwise. */
  backHref?: string;
  returnToOrigin?: boolean;
  right?: ReactNode;
  lock?: boolean;
}) {
  const open = useAppMenu();
  const pathname = usePathname();
  const fallback = safeInternalPath(backHref) ?? "/";
  const [backTarget, setBackTarget] = useState(fallback);
  useEffect(() => {
    navigation = rememberInternalRoute(navigation, pathname, document.referrer, window.location.origin);
    setBackTarget(returnToOrigin ? internalBackDestination(navigation, pathname, fallback) : fallback);
  }, [pathname, fallback, returnToOrigin]);
  return (
    <header className="top-bar">
      <div className="top-side">
        {backHref ? (
          <Link href={returnToOrigin ? backTarget : fallback} aria-label="Volver" className="icon-button">
            <Icon name="back" />
          </Link>
        ) : open ? (
          <button
            onClick={open}
            className="icon-button menu-trigger"
            aria-label="Abrir menú"
          >
            <Icon name="menu" />
          </button>
        ) : null}
      </div>
      {brand ? (
        <Link href="/" aria-label="VanDeFi, inicio">
          <Wordmark size={24} />
        </Link>
      ) : (
        <h1>{title}</h1>
      )}
      <div className="top-side end">
        {right !== undefined ? (
          right
        ) : lock ? (
          <span className="icon-button">
            <Icon name="shield" size={19} />
          </span>
        ) : (
          <AccountLink />
        )}
      </div>
    </header>
  );
}
