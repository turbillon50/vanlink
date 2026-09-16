"use client";
import { useId } from "react";
import { cn } from "@/lib/utils";
export function Logo({
  size = 28,
  glow = true,
  className,
}: {
  size?: number;
  glow?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size * 1.1}
      viewBox="0 0 100 110"
      fill="none"
      aria-hidden="true"
      className={cn("van-logo", glow && "van-logo-glow", className)}
    >
      <defs>
        <linearGradient
          id={id}
          x1="14"
          y1="12"
          x2="82"
          y2="96"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#dcfff1" />
          <stop offset=".15" stopColor="#51ffc1" />
          <stop offset=".46" stopColor="#00b890" />
          <stop offset=".72" stopColor="#04d4dc" />
          <stop offset="1" stopColor="#86faff" />
        </linearGradient>
        <linearGradient id={id + "-edge"}>
          <stop stopColor="white" stopOpacity=".8" />
          <stop offset=".55" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="#7ffff0" stopOpacity=".6" />
        </linearGradient>
      </defs>
      <path
        d="M13 12 49 97 87 12"
        stroke="#042724"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(2 3)"
      />
      <path
        className="van-logo-beam"
        d="M13 12 49 97 87 12"
        stroke={"url(#" + id + ")"}
        pathLength="100"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="van-logo-glint"
        d="M13 12 49 97 87 12"
        pathLength="100"
        stroke="#efffff"
        strokeOpacity=".8"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="m9 12 36 86M83 12 47 94"
        stroke={"url(#" + id + "-edge)"}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="wordmark">
      <Logo size={size} />
      <span>VanDeFi</span>
    </span>
  );
}
