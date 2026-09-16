"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/logo";
import { Icon } from "@/components/icons";
import { useAppMenu } from "@/components/app-shell";
export function TopBar({
  title,
  brand = false,
  backHref,
  right,
  lock = false,
}: {
  title?: string;
  brand?: boolean;
  backHref?: string;
  right?: ReactNode;
  lock?: boolean;
}) {
  const open = useAppMenu();
  return (
    <header className="top-bar">
      <div className="top-side">
        {backHref ? (
          <Link href={backHref} aria-label="Volver" className="icon-button">
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
          <Link href="/profile" className="avatar" aria-label="Mi cuenta">
            <Icon name="user" size={19} />
          </Link>
        )}
      </div>
    </header>
  );
}
