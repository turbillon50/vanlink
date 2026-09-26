"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { SplashContent } from "./atmosphere";
import { Icon } from "@/components/icons";

/** CSS is the clock and fallback: even without hydration the entrance clears.
 * It lives in the root layout, so client navigation never replays it. */
export function BrandEntrance() {
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();
  // El link de Bitcoin se abre directo: nada se interpone entre la persona y su dinero.
  if (dismissed || pathname === "/c") return null;

  return (
    <div
      className="splash brand-entrance"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setDismissed(true);
      }}
    >
      <div className="splash-art" aria-hidden="true">
        <SplashContent />
      </div>
      <button
        type="button"
        className="splash-skip"
        onClick={() => setDismissed(true)}
        aria-label="Omitir presentación y entrar"
      >
        Entrar <Icon name="arrow" size={15} />
      </button>
    </div>
  );
}
