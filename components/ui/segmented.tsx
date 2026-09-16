"use client"

import { cn } from "@/lib/utils"

export function Segmented({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-1 rounded-2xl border border-border bg-elevated p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-xl px-3 py-2 text-[14px] font-semibold transition-all duration-200 active:scale-[0.97]",
              active
                ? "bg-primary text-primary-foreground shadow-[0_6px_20px_-8px_rgba(52,231,161,0.6)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
