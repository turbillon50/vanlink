"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** A faceted, resolution-independent V. Light follows the edges, not the canvas. */
export function Logo({ size = 28, glow = true, className }: {
  size?: number; glow?: boolean; className?: string;
}) {
  const id = "van" + useId().replace(/:/g, "");
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 100 110" fill="none"
      aria-hidden="true" className={cn("van-logo", glow && "van-logo-glow", className)}>
      <defs>
        <linearGradient id={id + "-metal"} x1="12" y1="8" x2="78" y2="103" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f4fffd" /><stop offset=".13" stopColor="#b7ccca" />
          <stop offset=".3" stopColor="#364441" /><stop offset=".48" stopColor="#0e1919" />
          <stop offset=".62" stopColor="#88aaa5" /><stop offset=".72" stopColor="#e7fffa" />
          <stop offset=".86" stopColor="#285d54" /><stop offset="1" stopColor="#051514" />
        </linearGradient>
        <linearGradient id={id + "-right"} x1="84" y1="12" x2="44" y2="87" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f7ffff" /><stop offset=".2" stopColor="#7e9a96" />
          <stop offset=".45" stopColor="#d6ede8" /><stop offset=".7" stopColor="#2d504a" />
          <stop offset="1" stopColor="#0c1819" />
        </linearGradient>
        <linearGradient id={id + "-light"} x1="10" y1="8" x2="84" y2="105" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dbfff6" /><stop offset=".25" stopColor="#61ffd1" />
          <stop offset=".65" stopColor="#05b894" /><stop offset="1" stopColor="#14dcff" />
        </linearGradient>
        <linearGradient id={id + "-edge"} x1="0" y1="0" x2="100" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" /><stop offset=".3" stopColor="#a7d8c6" stopOpacity=".35" />
          <stop offset=".65" stopColor="#effffc" /><stop offset="1" stopColor="#00c8dc" />
        </linearGradient>
      </defs>
      <path d="M6 12 29 12 51 64 73 12 96 12 53 108 47 108Z" fill="#07191a" />
      <path d="m92 8 4 4-43 96-3-8Z" fill="#00677b" />
      <path d="M5 8h23l22 53L72 8h23L50 102Z" fill={"url(#" + id + "-metal)"} stroke={"url(#" + id + "-edge)"} strokeWidth=".9" strokeLinejoin="round" />
      <path d="M72 8h23L50 102V77Z" fill={"url(#" + id + "-right)"} />
      <path d="m5 8 9 7 36 78v9Z" fill="#081916" opacity=".83" />
      <path d="m28 8-3 7 25 62 4-8Z" fill="#d2fff0" opacity=".55" />
      <path d="m72 8 3 7h12L50 93v9L95 8Z" fill="#93c8c1" opacity=".19" />
      <path className="van-logo-beam" d="m7 10 43 92L94 9" pathLength="100" stroke={"url(#" + id + "-light)"} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 8h21l22 53L72 8h21M14 15l36 78 37-78" stroke={"url(#" + id + "-edge)"} strokeWidth=".75" strokeLinejoin="round" />
      <path className="van-logo-glint" d="M6 8h22l22 53L72 8h22L50 102Z" pathLength="100" stroke="#f3fffd" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return <span className="wordmark"><Logo size={size} /><span>VanDeFi</span></span>;
}
