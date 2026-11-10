import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccessError, requireAdmin, type AdminAccess } from "@/lib/admin/access";
import type { AdminPermission } from "@/lib/admin/policy";
import { AdminConsole } from "@/components/admin/console";
import { Wordmark } from "@/components/brand/logo";
import type { AdminResource } from "@/lib/admin/types";
import "@/components/admin/admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Centro de mando · VanDeFi", robots: { index: false, follow: false } };
const sections = new Set(["overview", "accounts", "account", "operations", "cases", "health", "audit", "activation", "grants", "incidents", "jobs"]);
const pagePermissions: Record<string, AdminPermission> = { overview: "overview.read", accounts: "accounts.read", account: "accounts.read", operations: "operations.read", cases: "cases.read", health: "health.read", audit: "audit.read", activation: "health.read", grants: "roles.write", incidents: "health.read", jobs: "health.read" };

export default async function AdminPage({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [path, query] = await Promise.all([params, searchParams]);
  const section = path.section?.[0] || "overview";
  if (!sections.has(section) || (path.section?.length || 0) > 1) notFound();
  let access: AdminAccess;
  try {
    access = await requireAdmin(pagePermissions[section]);
  } catch (error) {
    const unavailable = !(error instanceof AdminAccessError) || error.status === 503;
    return <main className="adm-denied"><Wordmark size={28}/><div className="adm-denied-card"><span className="adm-eyebrow">{unavailable ? "ENTORNO SIN COMPROBAR" : "ACCESO RESTRINGIDO"}</span><h1>Centro de mando</h1><p>{unavailable ? "No se pudo validar el entorno administrativo o su base aislada. El acceso permanece cerrado hasta poder comprobarlos." : "Esta sesión no tiene el permiso administrativo requerido. El acceso necesita una asignación explícita para este entorno."}</p><p className="adm-muted">No se han cargado datos de clientes. Puedes comprobar el identificador de tu propia sesión para que un operador autorizado revise la asignación.</p><div className="adm-actions"><Link className="adm-button primary" href="/admin/access">Verificar mi identidad</Link><Link className="adm-button" href="/">Volver a mi wallet</Link></div></div></main>;
  }
  const initialQuery = Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return <AdminConsole section={section as AdminResource} initialQuery={initialQuery} initialViewer={{ role: access.role, permissions: access.permissions }}/>;
}
