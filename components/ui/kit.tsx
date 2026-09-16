import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Card({
  children,
  className,
  glow = false,
}: {
  children: ReactNode
  className?: string
  glow?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        glow && "shadow-[0_20px_60px_-30px_rgba(52,231,161,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[13px] font-medium text-muted-foreground", className)}>{children}</p>
  )
}

type Status = "pending" | "paid" | "confirmed"

const statusMap: Record<Status, { label: string; dot: string; text: string }> = {
  pending: { label: "Pendiente", dot: "bg-warning", text: "text-warning" },
  paid: { label: "Pagado", dot: "bg-primary", text: "text-primary" },
  confirmed: { label: "Confirmado", dot: "bg-primary", text: "text-primary" },
}

export function StatusPill({ status }: { status: Status }) {
  const s = statusMap[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", s.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  )
}

export const inputClass =
  "w-full rounded-2xl border border-border bg-elevated px-4 py-3.5 text-[15px] text-foreground placeholder:text-muted-foreground/70 " +
  "transition-all duration-150 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export function TokenChip({
  symbol = "USDC",
  network = "Base",
}: {
  symbol?: string
  network?: string
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-info text-[11px] font-bold text-white shadow-[0_0_12px_rgba(74,168,255,0.5)]">
        $
      </span>
      <span className="text-[15px] font-semibold">{symbol}</span>
      <span className="text-[13px] text-muted-foreground">· {network}</span>
    </span>
  )
}
