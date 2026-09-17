import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";

const links = [
  { href: "/legal/privacidad", label: "Privacidad" },
  { href: "/legal/terminos", label: "Términos" },
  { href: "/legal/riesgos", label: "Riesgos" },
  { href: "/legal/eliminar-cuenta", label: "Eliminar cuenta" },
];

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <TopBar title="Legal" backHref="/profile" />
      <nav className="legal-nav" aria-label="Documentos legales">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
      </nav>
      <article className="legal-doc v-folio">{children}</article>
    </AppShell>
  );
}
