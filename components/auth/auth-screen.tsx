"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, SignUp } from "@clerk/nextjs";
import { Logo, Wordmark } from "@/components/brand/logo";
import { Icon } from "@/components/icons";
import { PressButton } from "@/components/ui/press-button";
import { authConfigured } from "@/lib/auth-config";
import { resumePath, originFrom } from "@/lib/navigation/module-one";
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
    socialButtons: "va-clerk-hidden",
    socialButtonsBlockButton: "va-social-btn",
    socialButtonsBlockButtonText: "va-social-text",
    dividerRow: "va-clerk-hidden",
    formFieldLabel: "va-label",
    formFieldInput: "va-input",
    formButtonPrimary: "va-primary",
    footer: "va-clerk-footer",
    footerAction: "va-footer-action",
    footerActionLink: "va-footer-link",
  },
};

export function AuthScreen({ signUp = false }: { signUp?: boolean }) {
  const [destination, setDestination] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const url = new URL(window.location.href);
    const direct = resumePath(url.searchParams.get("volver"));
    let path = direct;
    try {
      const atStart = /^\/(login|sign-up)\/?$/.test(url.pathname);
      if (direct) sessionStorage.setItem("vd-access-return", direct);
      else if (atStart) sessionStorage.removeItem("vd-access-return");
      else path = resumePath(sessionStorage.getItem("vd-access-return"));
    } catch {}
    setDestination(path);
  }, []);
  const query = destination ? "?volver=" + encodeURIComponent(destination) : "";
  const back = destination ? originFrom(new URL(destination, "https://navigation.invalid")) : "/";
  return (
    <main className="va-auth">
      <section className="va-auth-hero" aria-hidden="true">
        <Wordmark size={26} />
        <div className="va-auth-emblem"><Logo size={140} /></div>
        <div>
          <h2>Tu cartera<br /><span>digital.</span></h2>
          <p>Consulta tus saldos, revisa movimientos y administra el acceso a tu wallet.</p>
        </div>
      </section>

      <section className="va-auth-side">
        <div className="va-auth-top">
          <Link href={back} aria-label="Volver" className="icon-button"><Icon name="back" /></Link>
        </div>
        <div className="va-auth-panel">
          <div className="va-auth-head">
            <Wordmark size={24} />
            <h1>{signUp ? "Crea tu cuenta" : "Entrar a VanDeFi"}</h1>
            <p>{signUp ? "Registra tu identidad para acceder a VanDeFi." : "Continúa con tu cuenta para abrir tu cartera."}</p>
          </div>
          {authConfigured ? <div className="va-auth-form">
            <ClerkLoading><AccessLoading /></ClerkLoading>
            <ClerkFailed><AccessRetry /></ClerkFailed>
            <ClerkLoaded>{destination === undefined ? <AccessLoading /> : signUp
              ? <SignUp routing="path" path="/sign-up" signInUrl={"/login" + query} forceRedirectUrl={destination ?? undefined} signInForceRedirectUrl={destination ?? undefined} appearance={authAppearance} />
              : <SignIn routing="path" path="/login" signUpUrl={"/sign-up" + query} forceRedirectUrl={destination ?? undefined} signUpForceRedirectUrl={destination ?? undefined} appearance={authAppearance} />}</ClerkLoaded>
          </div> : <section className="access-status"><h2>El acceso está en preparación</h2><p>Puedes explorar VanDeFi y preparar borradores. El registro estará disponible al conectar esta instalación.</p></section>}
          <PressButton variant="ghost" href={back}>Seguir explorando</PressButton>
          <p className="va-auth-legal">Para autorizar movimientos necesitas un dispositivo autorizado para tu wallet.</p>
        </div>
      </section>
    </main>
  );
}
