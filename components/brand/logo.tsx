export function Logo({ size = 28, className }: { size?: number; glow?: boolean; className?: string }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 64 64" fill="currentColor">
    <path d="M3 10h13l16 30 8-15h13L32 61zM43 6h16l-7 13H36z" />
  </svg>;
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return <span aria-label="VanDeFi" style={{fontSize:size, fontWeight:650, letterSpacing:"-.055em", lineHeight:1.15}}>VanDeFi</span>;
}
