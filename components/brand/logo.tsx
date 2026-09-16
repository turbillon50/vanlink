import { Icon } from "@/components/icons";

export function Logo({ size = 28, className }: {
  size?: number; glow?: boolean; className?: string;
}) {
  return <Icon name="wallet" size={size} className={className} />;
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return <span className="wordmark" aria-label="VanDeFi" style={{ gap: 0, fontSize: size, fontWeight: 650, letterSpacing: "-.045em", lineHeight: 1.15 }}><span style={{ fontSize: "inherit", fontWeight: "inherit", letterSpacing: "inherit", color: "#d6d6dc" }}>Van</span><span style={{ fontSize: "inherit", fontWeight: "inherit", letterSpacing: "inherit", background: "linear-gradient(100deg,#7948e8,#a06af2)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>DeFi</span></span>;
}
