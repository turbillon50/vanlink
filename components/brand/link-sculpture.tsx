"use client";
import { useId } from "react";
export function LinkSculpture() {
  const id = "chain" + useId().replace(/:/g, "");
  return (
    <svg
      className="link-sculpture"
      width="84"
      height="84"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={id}
          x1="16"
          y1="12"
          x2="81"
          y2="83"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#e3fff8" />
          <stop offset=".22" stopColor="#7bffdc" />
          <stop offset=".49" stopColor="#077762" />
          <stop offset=".68" stopColor="#35dec9" />
          <stop offset="1" stopColor="#b5fbff" />
        </linearGradient>
      </defs>
      <g
        transform="rotate(-36 50 50)"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect
          x="13"
          y="25"
          width="48"
          height="29"
          rx="14.5"
          stroke="#002c27"
          strokeWidth="12"
          transform="translate(0 3)"
        />
        <rect
          x="13"
          y="25"
          width="48"
          height="29"
          rx="14.5"
          stroke={"url(#" + id + ")"}
          strokeWidth="9"
        />
        <rect
          x="42"
          y="44"
          width="45"
          height="29"
          rx="14.5"
          stroke="#003139"
          strokeWidth="12"
          transform="translate(0 3)"
        />
        <rect
          x="42"
          y="44"
          width="45"
          height="29"
          rx="14.5"
          stroke={"url(#" + id + ")"}
          strokeWidth="9"
        />
        <path
          d="M28 22h20a18 18 0 0 1 17 15M57 41h15a17 17 0 0 1 17 14"
          stroke="#e6fffa"
          strokeOpacity=".65"
          strokeWidth="1.2"
        />
        <path
          d="M55 53a15 15 0 0 1-7 1H32"
          stroke={"url(#" + id + ")"}
          strokeWidth="9"
        />
      </g>
    </svg>
  );
}
