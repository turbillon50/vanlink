import { ArrowDownLeft, ArrowUpRight, Repeat, Clock } from "lucide-react"
import { StatusPill } from "@/components/ui/kit"
import { cn } from "@/lib/utils"

export type ActivityKind = "in" | "out" | "swap" | "pending"

const iconMap = {
  in: { Icon: ArrowDownLeft, tint: "bg-primary/12 text-primary" },
  out: { Icon: ArrowUpRight, tint: "bg-foreground/8 text-foreground" },
  swap: { Icon: Repeat, tint: "bg-foreground/8 text-foreground" },
  pending: { Icon: Clock, tint: "bg-warning/12 text-warning" },
} as const

export function ActivityRow({
  kind,
  title,
  subtitle,
  amount,
  status,
}: {
  kind: ActivityKind
  title: string
  subtitle: string
  amount: string
  status?: "pending" | "paid" | "confirmed"
}) {
  const { Icon, tint } = iconMap[kind]
  const positive = amount.trim().startsWith("+")
  return (
    <div className="flex items-center gap-3.5 py-3.5">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", tint)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium">{title}</p>
        <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="text-right">
        <p className={cn("tabular text-[15px] font-semibold", positive ? "text-primary" : "text-foreground")}>
          {amount}
        </p>
        {status ? (
          <div className="mt-0.5 flex justify-end">
            <StatusPill status={status} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
