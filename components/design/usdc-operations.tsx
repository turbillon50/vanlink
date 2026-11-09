import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

const operations: { label: string; href: string; icon: IconName }[] = [
  { label: "Comprar", href: "/up", icon: "down" },
  { label: "Enviar", href: "/send", icon: "send" },
  { label: "Retirar", href: "/down", icon: "up" },
  { label: "VanLink", href: "/vanlink/create", icon: "link" },
];

export function USDCOperationBar() {
  return (
    <nav className="vd-operation-strip vd-remittance-operations" aria-label="Operaciones con USDC en Polygon">
      {operations.map(action => (
        <Link key={action.label} href={action.href} className="vd-operation">
          <span className="vd-operation-key"><Icon name={action.icon} size={20}/></span>
          <span className="vd-operation-label">{action.label}</span>
        </Link>
      ))}
    </nav>
  );
}
