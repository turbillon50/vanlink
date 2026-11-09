import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

/**
 * VanDeFi · piezas de interfaz portadas del lenguaje VLiving.
 *
 * El cristal, ritmo, contornos y microinteracciones nacen de los tokens de
 * VLiving; la identidad, accesibilidad y datos pertenecen a VanDeFi.
 * Estos componentes NO leen ni firman transacciones.
 */
export function FinGlass({
  children,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  if (as === "section") return <section className={`vd-glass ${className}`}>{children}</section>;
  if (as === "article") return <article className={`vd-glass ${className}`}>{children}</article>;
  return <div className={`vd-glass ${className}`}>{children}</div>;
}

export function FinSectionHeading({
  eyebrow,
  title,
  href,
  linkLabel,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="vd-section-heading">
      <div>
        {eyebrow && <p className="vd-overline">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {href && linkLabel && (
        <Link className="vd-text-action" href={href}>
          {linkLabel}<Icon name="arrow" size={15} />
        </Link>
      )}
    </div>
  );
}

export function FinQuickAction({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: IconName;
}) {
  return (
    <Link href={href} className="vd-shortcut">
      <span className="vd-shortcut-key"><Icon name={icon} size={21}/></span>
      <span className="vd-shortcut-label">{label}</span>
    </Link>
  );
}
