"use client";

import { useEffect, useState } from "react";
import { ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, SignUp } from "@clerk/nextjs";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import { authConfigured } from "@/lib/auth-config";

function AccessRetry() {
  return <div className="access-status" role="status"><h2>No pudimos abrir el acceso</h2><p>Revisa tu conexión e inténtalo de nuevo. Puedes seguir explorando VanDeFi.</p><PressButton onClick={() => window.location.reload()}>Volver a intentar</PressButton></div>;
}

function AccessLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);
  return slow ? <AccessRetry /> : <div className="auth-loading" role="status"><span className="auth-spinner" aria-hidden="true" /><p>Preparando tu acceso…</p></div>;
}

export function AuthScreen({ signUp = false, previewIsolated = false }: { signUp?: boolean; previewIsolated?: boolean }) {
  return (
    <main className="auth-page">
      <TopBar brand backHref="/" right={<span />} />
      <div className="auth-intro">
        <p className="eyebrow">{previewIsolated ? "PREVIEW AISLADO / ACCESO EXISTENTE" : "TU ESPACIO EN VANDEFI"}</p>
        <h1>{signUp ? "Todo empieza contigo." : "Qué bueno verte."}</h1>
        <p>{previewIsolated ? "Inicia sesión con tu cuenta existente para comprobar tu acceso." : signUp ? "Crea tu cuenta y prepara tu wallet para USDT en Polygon." : "Entra a tu cuenta. Así de simple."}</p>
      </div>
      {authConfigured ? <div className="auth-form">
        <ClerkLoading><AccessLoading /></ClerkLoading>
        <ClerkFailed><AccessRetry /></ClerkFailed>
        <ClerkLoaded>{signUp ? <SignUp routing="path" path="/sign-up" signInUrl="/login" /> : <SignIn routing="path" path="/login" signUpUrl="/sign-up" withSignUp={previewIsolated ? false : undefined} transferable={previewIsolated ? false : undefined} appearance={previewIsolated ? { elements: { footerAction: { display: "none" } } } : undefined}/>}</ClerkLoaded>
      </div> : <section className="access-status"><h2>El acceso está en preparación</h2><p>Puedes explorar VanDeFi y preparar borradores. El registro estará disponible al conectar esta instalación.</p></section>}
      <PressButton variant="ghost" href="/">Seguir explorando</PressButton>
      <p className="auth-note">{previewIsolated ? "Este preview permite consultar con una cuenta existente y acceso autorizado. No crea wallets ni habilita movimientos. Tus permisos administrativos se comprueban por separado." : "USDT en Polygon es el activo principal; Base y Bitcoin se conservan como legado explícito. La llave del dispositivo permanece protegida en tu navegador. Crear una cuenta no mueve dinero."}</p>
    </main>
  );
}
