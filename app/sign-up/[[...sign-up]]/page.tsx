import { AuthScreen } from "@/components/auth/auth-screen";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import { isAdminPreviewIsolated } from "@/lib/admin/isolation";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  if (isAdminPreviewIsolated()) {
    return <main className="auth-page"><TopBar brand backHref="/" right={<span/>}/><div className="auth-intro"><p className="eyebrow">PREVIEW AISLADO</p><h1>Accede con tu cuenta existente.</h1><p>El registro de nuevas cuentas está cerrado en este preview.</p></div><section className="access-status"><h2>Consulta con acceso autorizado</h2><p>Usa tu cuenta existente de VanDeFi. Este entorno no crea identidades ni wallets y no concede permisos administrativos al iniciar sesión.</p><PressButton href="/login?redirect_url=%2Fadmin%2Faccess">Iniciar sesión</PressButton></section><PressButton variant="ghost" href="/">Volver a VanDeFi</PressButton></main>;
  }
  return <AuthScreen signUp/>;
}
