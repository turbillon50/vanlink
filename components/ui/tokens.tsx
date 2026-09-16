import { cn } from "@/lib/utils"

export function UsdcDot({ size = 28 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full bg-info font-bold text-white shadow-[0_0_12px_rgba(74,168,255,0.45)]"
      style={{ width: size, height: size, fontSize: size * 0.44 }}
    >
      $
    </span>
  )
}

export function EthDot({ size = 28 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full bg-[#3b3f52]"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 16 24" fill="none" aria-hidden="true">
        <path d="M8 0 L8 9 L15 12 Z M8 0 L1 12 L8 9 Z" fill="#dfe3f2" />
        <path d="M8 16 L8 24 L15 13.5 Z M8 24 L8 16 L1 13.5 Z" fill="#b9c0dd" />
      </svg>
    </span>
  )
}

export function BaseDot({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-info"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="block rounded-full bg-white" style={{ width: size * 0.4, height: size * 0.12 }} />
    </span>
  )
}

export function FlagMX({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex overflow-hidden rounded-full border border-border", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="h-full w-1/3 bg-[#006847]" />
      <span className="h-full w-1/3 bg-white" />
      <span className="h-full w-1/3 bg-[#ce1126]" />
    </span>
  )
}
