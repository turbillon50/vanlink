import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { esMX } from "@clerk/localizations";
import { authConfigured } from "@/lib/auth-config";
import { SessionBoundary } from "@/components/auth/session-boundary";
import { isAdminPreviewIsolated } from "@/lib/admin/isolation";

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!authConfigured) return children;
  return (
    <ClerkProvider
      localization={esMX}
      signInUrl="/login"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/profile"
      signUpFallbackRedirectUrl="/profile"
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorPrimary: "#29edb7",
          colorBackground: "#090f12",
          colorForeground: "#edf7f2",
          colorMutedForeground: "#a8bfb5",
          colorInput: "#111c20",
          colorInputForeground: "#f1faf6",
          colorDanger: "#ffafa8",
          colorBorder: "#b9e4d32b",
          borderRadius: "1rem",
          fontFamily: "var(--font-geist-sans), sans-serif",
        },
        elements: {
          rootBox: "clerk-root",
          cardBox: "clerk-card-box",
          card: "clerk-card",
          formButtonPrimary: "clerk-primary-button",
          footer: "clerk-footer",
        },
      }}
    >
      <SessionBoundary previewIsolated={isAdminPreviewIsolated()}>{children}</SessionBoundary>
    </ClerkProvider>
  );
}
