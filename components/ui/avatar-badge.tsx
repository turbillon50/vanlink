import Link from "next/link"
import { cn } from "@/lib/utils"

export function AvatarBadge({
  initial = "L",
  size = 36,
  href,
  className,
}: {
  initial?: string
  size?: number
  href?: string
  className?: string
}) {
  const inner = (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-border bg-elevated font-semibold text-muted-foreground",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  )
  if (href) {
    return (
      <Link
        href={href}
        aria-label="Mi perfil"
        className="transition-transform duration-150 active:scale-95"
      >
        {inner}
      </Link>
    )
  }
  return inner
}
