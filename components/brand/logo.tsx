"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** The V is a physical mark: two planes, one light source, no flat neon fill. */
export function Logo({ size = 28, glow = true, className }: {
  size?: number; glow?: boolean; className?: string;
}) {
  const id = "van" + useId().replace(/:/g, "");
  return (
    <svg width={size} height={size * 1.08} viewBox="0 0 100 108" fill="none"
      aria-hidden="true" className={cn("van-logo", glow && "van-logo-glow", className)}>
      <defs>
        <linearGradient id={id + "-metal"} x1="8" y1="4" x2="83" y2="104" gradientUnits="userSpaceOnUse">
          <stop stopColor="#eaffff" /><stop offset=".12" stopColor="#8ea9a8" />
          <stop offset=".32" stopColor="#162629" /><stop offset=".5" stopColor="#061115" />
          <stop offset=".69" stopColor="#7eb0ab" /><stop offset=".82" stopColor="#ecfffa" />
          <stop offset="1" stopColor="#0b2e32" />
        </linearGradient>
        <linearGradient id={id + "-right"} x1="77" y1="7" x2="42" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#cffff8" /><stop offset=".24" stopColor="#5b8787" />
          <stop offset=".58" stopColor="#0b343c" /><stop offset="1" stopColor="#071015" />
        </linearGradient>
        <linearGradient id={id + "-light"} x1="6" y1="4" x2="90" y2="104" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f0fffd" /><stop offset=".26" stopColor="#69ffe2" />
          <stop offset=".6" stopColor="#00bbd6" /><stop offset="1" stopColor="#7367ff" />
        </linearGradient>
        <linearGradient id={id + "-edge"} x1="0" y1="0" x2="100" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" /><stop offset=".3" stopColor="#a7d8c6" stopOpacity=".35" />
          <stop offset=".65" stopColor="#effffc" /><stop offset="1" stopColor="#00c8dc" />
        </linearGradient>
      </defs>
      <path d="M5 9h24l21 56L71 9h24L53 103H47Z" fill="#061216" opacity=".9" />
      <path d="M5 7h24l21 55L71 7h24L50 101Z" fill={"url(#" + id + "-metal)"} stroke={"url(#" + id + "-edge)"} strokeWidth=".95" strokeLinejoin="round" />
      <path d="M71 7h24L50 101V76Z" fill={"url(#" + id + "-right)"} opacity=".9" />
      <path d="m28 8-3 7 25 61 4-9Z" fill="#e9fff9" opacity=".42" />
      <path className="van-logo-beam" d="m7 10 43 90L93 9" pathLength="100" stroke={"url(#" + id + "-light)"} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 8h21l22 56L72 8h21" stroke={"url(#" + id + "-edge)"} strokeWidth=".8" strokeLinejoin="round" />
      <path className="van-logo-glint" d="M6 8h22l22 56L72 8h22" pathLength="100" stroke="#f3fffd" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return <span className="wordmark"><Logo size={size} /><span>VanDeFi</span></span>;
}
