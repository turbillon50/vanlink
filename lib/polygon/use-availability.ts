"use client";

import { useEffect, useState } from "react";
import { readPolygonAvailability, type PolygonAvailability } from "@/lib/polygon/availability";

export function usePolygonAvailability(): PolygonAvailability {
  const [availability, setAvailability] = useState<PolygonAvailability>("loading");
  useEffect(() => {
    let live = true;
    let current: AbortController | undefined;
    const refresh = async () => {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      setAvailability("loading");
      const timeout = window.setTimeout(() => controller.abort(), 8_000);
      try {
        const next = await readPolygonAvailability(controller.signal);
        if (live && current === controller) setAvailability(next);
      } finally { window.clearTimeout(timeout); }
    };
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      live = false; current?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
  return availability;
}
