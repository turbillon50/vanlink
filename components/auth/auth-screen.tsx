"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, SignUp } from "@clerk/nextjs";
import { Wordmark } from "@/components/brand/logo";
import { Icon } from "@/components/icons";
import { PressButton } from "@/components/ui/press-button";
import { authConfigured } from "@/lib/auth-config";
import "./auth.css";

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

/** Clerk styled to the VanDeFi auth layout: big 56px buttons, our own heading. */
const authAppearance = {
  layout: { socialButtonsVariant: "blockButton" as const, socialButtonsPlacement: "top" as const, logoPlacement: "none" as const },
  elements: {
    rootBox: "va-clerk-root",
    cardBox: "va-clerk-cardbox",
    card: "va-clerk-card",
    header: "va-clerk-hidden",
    socialButtons: "va-social",
    socialButtonsBlockButton: "va-social-btn",
    socialButtonsBlockButtonText: "va-social-text",
    dividerRow: "va-divider",
    formFieldLabel: "va-label",
    formFieldInput: "va-input",
    formButtonPrimary: "va-primary",
    footer: "va-clerk-footer",
    footerAction: "va-footer-action",
    footerActionLink: "va-footer-link",
  },
};

export function AuthScreen({ signUp = false }: { signUp?: boolean }) {
  return (
    <main className="va-auth">
      <section className="va-auth-hero" aria-hidden="true">
        <Wordmark size={26} />
        <div>
          <h2>Manda dólares<br />digitales en <span>segundos.</span></h2>
          <p>USDT en Polygon. Sin bancos de por medio, sin esperar días.</p>
          <div className="va-auth-balance">
            <small>Saldo disponible</small>
            <strong>$1,250.00 <em>USDT</em></strong>
            <span>▲ Enviado a Caracas · hace 2 min</span>
          </div>
        </div>
        <ul className="va-auth-trust"><li>Autocustodia</li><li>Polygon</li><li>Protegido por Clerk</li></ul>
      </section>

      <section className="va-auth-side">
        <div className="va-auth-top">
          <Link href="/" aria-label="Volver" className="icon-button"><Icon name="back" /></Link>
        </div>
        <div className="va-auth-panel">
          <div className="va-auth-head">
            <Wordmark size={24} />
            <h1>{signUp ? "Crea tu cuenta" : "Qué bueno verte"}</h1>
            <p>{signUp ? "Crea tu cuenta para acceder a VanDeFi." : "Entra en segundos. Tu dinero, tu control."}</p>
          </div>
          {authConfigured ? <div className="va-auth-form">
            <ClerkLoading><AccessLoading /></ClerkLoading>
            <ClerkFailed><AccessRetry /></ClerkFailed>
            <ClerkLoaded>{signUp
              ? <SignUp routing="path" path="/sign-up" signInUrl="/login" appearance={authAppearance} />
              : <SignIn routing="path" path="/login" signUpUrl="/sign-up" appearance={authAppearance} />}</ClerkLoaded>
          </div> : <section className="access-status"><h2>El acceso está en preparación</h2><p>Puedes explorar VanDeFi y preparar borradores. El registro estará disponible al conectar esta instalación.</p></section>}
          <PressButton variant="ghost" href="/">Seguir explorando</PressButton>
          <p className="va-auth-legal">VanDeFi utiliza <b>USDT en Polygon</b>. La llave de tu dispositivo permanece en tu navegador. Crear una cuenta no mueve dinero.</p>
        </div>
      </section>
    </main>
  );
}
