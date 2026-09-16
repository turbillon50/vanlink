"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Icon } from "@/components/icons";
import { authConfigured } from "@/lib/auth-config";

function AccountView({ rail, name, signedIn = false }: { rail?: boolean; name?: string | null; signedIn?: boolean }) {
  const initial = name?.trim().charAt(0).toLocaleUpperCase("es");
  return (
    <Link href={signedIn ? "/profile" : "/login"} className={rail ? "rail-account" : "avatar"} aria-label={signedIn ? "Mi cuenta" : "Iniciar sesión"}>
      <span className={rail ? "avatar" : "account-initial"}>
        {initial || <Icon name="user" size={19} />}
      </span>
      {rail && <><span>{signedIn ? name || "Mi cuenta" : "Tu cuenta"}<small>{signedIn ? "Sesión activa" : "Iniciar sesión"}</small></span><Icon name="chevron" size={16} /></>}
    </Link>
  );
}

function ConnectedAccountLink({ rail }: { rail?: boolean }) {
  const { user, isSignedIn } = useUser();
  return <AccountView rail={rail} name={user?.fullName || user?.firstName} signedIn={isSignedIn} />;
}

export function AccountLink({ rail }: { rail?: boolean }) {
  return authConfigured ? <ConnectedAccountLink rail={rail} /> : <AccountView rail={rail} />;
}
