"use client";
import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";

/** Remove device credentials after sign-out or a different Clerk user signs in. */
export function WalletSessionBoundary() {
  const { isLoaded, user } = useUser();
  const userId = user?.id;
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    import("@/lib/wallet/browser").then(async module => {
      if (cancelled) return;
      const owner = module.walletDeviceOwner();
      if (owner && owner !== userId) await module.clearWalletDevice();
    }).catch(() => { /* Storage may be disabled; wallet activation will report it. */ });
    return () => { cancelled = true; };
  }, [isLoaded, userId]);
  return null;
}
