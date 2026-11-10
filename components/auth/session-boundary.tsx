"use client";

import { Fragment, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { AutoWalletEnrollment } from "@/components/wallet/auto-enrollment";
import { walletSession } from "@/lib/wallet/session";

export function SessionBoundary({ children, previewIsolated }: { children: ReactNode; previewIsolated: boolean }) {
  const { userId, sessionId, isLoaded } = useAuth();
  const pathname = usePathname();
  // Synchronous invalidation prevents an old async job from mutating before an effect runs.
  walletSession.synchronize(isLoaded ? userId : null, isLoaded ? sessionId : null);
  const identity = isLoaded ? `${sessionId || "guest"}:${userId || "guest"}` : "loading";
  return <Fragment key={identity}>
    {isLoaded && !previewIsolated && !pathname.startsWith("/admin") && <AutoWalletEnrollment />}
    {children}
  </Fragment>;
}
