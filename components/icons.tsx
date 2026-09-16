import type { SVGProps } from "react";
export type IconName =
  | "home"
  | "link"
  | "activity"
  | "user"
  | "menu"
  | "close"
  | "up"
  | "down"
  | "swap"
  | "plus"
  | "arrow"
  | "back"
  | "check"
  | "copy"
  | "shield"
  | "eye"
  | "wallet"
  | "globe"
  | "info"
  | "chat"
  | "chart"
  | "spark"
  | "send"
  | "chevron";
const paths: Record<IconName, React.ReactNode> = {
  home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z" />,
  link: (
    <path d="m10 7 2-2a5 5 0 0 1 7 7l-3 3a5 5 0 0 1-7 0M14 17l-2 2a5 5 0 0 1-7-7l3-3a5 5 0 0 1 7 0" />
  ),
  activity: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h11" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  up: <path d="M12 20V4m-6 6 6-6 6 6" />,
  down: <path d="M12 4v16m-6-6 6 6 6-6" />,
  swap: <path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 19 19 5M6 5h13v13" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="3" />
      <path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="15" rx="3" />
      <path d="M3 9V5a2 2 0 0 1 2-2h12M21 12h-6v5h6M17 14.5h.01" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  chat: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2A8.5 8.5 0 0 1 21 11.5ZM7 10h9M7 14h6" />,
  chart: <path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6" />,
  spark: (
    <>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z" />
    </>
  ),
  send: <path d="m4 4 16 8-16 8 3-8Z" />,
  chevron: <path d="m9 5 7 7-7 7" />,
};
export function Icon({
  name,
  size = 22,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
