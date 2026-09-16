"use client";

import { SignOutButton, useClerk, useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";
import { PressButton } from "@/components/ui/press-button";
import { authConfigured } from "@/lib/auth-config";

function ProfileContent() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { openUserProfile } = useClerk();
  if (!isLoaded) return <div className="auth-loading" role="status">Abriendo tu cuenta…</div>;
  if (!isSignedIn) return <PressButton href="/login">Iniciar sesión</PressButton>;
  const name = user.fullName || user.firstName || "Tu cuenta";
  return <>
    <div className="profile-card">
      <span className="avatar account-initial">{name.charAt(0).toLocaleUpperCase("es")}</span>
      <div><h2>{name}</h2><p className="profile-email">{user.primaryEmailAddress?.emailAddress || "Sesión activa"}</p></div>
    </div>
    <div className="settings-group account-settings">
      <button onClick={() => openUserProfile()}><Icon name="user" size={19} /><span>Mi cuenta y seguridad</span><Icon name="chevron" size={17} /></button>
      <p>Actualiza tus datos, revisa tus sesiones y administra tu acceso.</p>
    </div>
    <section className="access-status">
      <h2>Tu cuenta ya tiene su espacio</h2>
      <p>Tu wallet está pendiente de conexión. Mientras tanto puedes explorar VanDeFi y preparar tus VanLinks.</p>
      <PressButton href="/vanlink">Ver mis VanLinks <Icon name="arrow" size={17} /></PressButton>
    </section>
    <div className="connection-note"><p>Los borradores se guardan solo en este navegador. Todavía no se sincronizan con tu cuenta ni reciben fondos.</p></div>
    <SignOutButton redirectUrl="/"><button className="press-button secondary">Cerrar sesión</button></SignOutButton>
  </>;
}

export default function ProfilePage() {
  return <AppShell><TopBar title="Mi cuenta" backHref="/" />{authConfigured ? <ProfileContent /> : <PressButton href="/login">Ver acceso a mi cuenta</PressButton>}</AppShell>;
}
