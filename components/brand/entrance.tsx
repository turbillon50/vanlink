"use client";

import { useState } from "react";
import { SplashContent } from "./atmosphere";
import { Icon } from "@/components/icons";

/** CSS is the clock and fallback: even without hydration the entrance clears.
 * It lives in the root layout, so client navigation never replays it. */
export function BrandEntrance() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

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
