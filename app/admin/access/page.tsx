import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Wordmark } from "@/components/brand/logo";
import { CopyIdentity } from "@/components/admin/copy-identity";
import { authConfigured } from "@/lib/auth-config";
import "@/components/admin/admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificar mi identidad · VanDeFi", robots: { index: false, follow: false } };

export default async function AdminIdentityPage() {
  const userId = authConfigured ? (await auth()).userId : null;
  return <main className="adm-denied"><Wordmark size={28}/><div className="adm-denied-card"><span className="adm-eyebrow">IDENTIDAD DE ESTA SESIÓN</span><h1>Verificar mi acceso</h1>{userId ? <><p>Este es el identificador exacto de tu cuenta autenticada en Clerk. La asignación administrativa debe realizarla un operador autorizado y registrarse con su motivo y entorno.</p><CopyIdentity userId={userId}/><p className="adm-muted">Esta pantalla no asigna roles ni muestra información de otras cuentas. No compartas credenciales, códigos OTP ni tokens de sesión.</p><div className="adm-actions"><Link className="adm-button primary" href="/admin">Comprobar acceso</Link><Link className="adm-button" href="/">Volver a mi wallet</Link></div></> : <><p>Inicia sesión para comprobar tu propio identificador. Tener una cuenta de usuario no concede acceso al centro de mando.</p><Link className="adm-button primary" href="/login?redirect_url=%2Fadmin%2Faccess">Iniciar sesión</Link></>}</div></main>;
}
