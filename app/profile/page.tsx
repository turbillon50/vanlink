"use client";

import { SignOutButton, useClerk, useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";
import { PressButton } from "@/components/ui/press-button";
import { authConfigured } from "@/lib/auth-config";
import { WalletSetup } from "@/components/wallet/setup";

function ProfileContent() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { openUserProfile } = useClerk();
  if (!isLoaded) return <div className="auth-loading" role="status"><span className="auth-spinner" aria-hidden="true" />Abriendo tu cuenta…</div>;
  if (!isSignedIn) return <PressButton href="/login">Iniciar sesión</PressButton>;
  const name = user.fullName || user.firstName || "Tu cuenta";
  return <div className="account-layout">
    <header className="account-heading">
      <p className="eyebrow">TU ESPACIO PERSONAL</p>
      <h2>Tu cuenta, a la mano.</h2>
      <p>Administra tu wallet y tu acceso.</p>
    </header>
    <WalletSetup userId={user.id} />
    <div className="account-identity-panel">
      <div className="profile-card">
        <span className="avatar account-initial">{name.charAt(0).toLocaleUpperCase("es")}</span>
        <div><h3>{name}</h3><p className="profile-email">{user.primaryEmailAddress?.emailAddress || "Sesión activa"}</p></div>
      </div>
      <span className="account-session"><i aria-hidden="true" />Sesión iniciada</span>
      <div className="settings-group account-settings">
        <button onClick={() => openUserProfile()}><span className="account-setting-icon"><Icon name="shield" size={19} /></span><span><strong>Cuenta y seguridad</strong><small>Datos personales y sesiones</small></span><Icon name="chevron" size={16} /></button>
      </div>
      <SignOutButton redirectUrl="/"><button className="account-signout"><Icon name="back" size={16} />Cerrar sesión</button></SignOutButton>
    </div>
    <aside className="account-footnote"><Icon name="info" size={16} /><p>Tus borradores de VanLink se guardan en este navegador. Aún no reciben fondos ni se sincronizan entre dispositivos.</p></aside>
  </div>;
}

export default function ProfilePage() {
  return <AppShell wide><TopBar title="Mi cuenta" backHref="/" />{authConfigured ? <ProfileContent /> : <PressButton href="/login">Ver acceso a mi cuenta</PressButton>}</AppShell>;
}
