import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

const operations: { href: string; label: string; icon: IconName }[] = [
  { href: "/up", label: "Depositar", icon: "down" },
  { href: "/down", label: "Retirar", icon: "up" },
  { href: "/send", label: "Transferir", icon: "send" },
  { href: "/swap", label: "Convertir", icon: "swap" },
  { href: "/vanlink/create", label: "Cobrar", icon: "link" },
];

/** Botonera de operación compartida: enlaces verdaderos, sin acciones ficticias. */
export function OperationBar({ current }: { current?: string }) {
  return (
    <nav className="vd-operation-strip" aria-label="Operaciones con dinero">
      {operations.map((operation) => (
        <Link
          key={operation.href}
          href={operation.href}
          className={current === operation.href ? "vd-operation selected" : "vd-operation"}
          aria-current={current === operation.href ? "page" : undefined}
        >
          <span className="vd-operation-key"><Icon name={operation.icon} size={20}/></span>
          <span className="vd-operation-label">{operation.label}</span>
        </Link>
      ))}
    </nav>
  );
}
