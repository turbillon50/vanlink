import { Wordmark } from "./logo";

export function Atmosphere() {
  return <div className="ambient-light" aria-hidden="true"><i /><i /></div>;
}

export function BrandSculpture({ compact = false }: { compact?: boolean }) {
  return <div style={{ padding: compact ? "55px 0" : "20px 0", textAlign: "center" }}><Wordmark size={48} /></div>;
}

export function SplashContent({ loading = false }: { loading?: boolean }) {
  return <>
    <div className="splash-center">
      <BrandSculpture />
      <p>crypto wallet</p>
    </div>
    <div className="splash-bottom">
      <div className="splash-loader" aria-hidden="true" />
      <p>{loading ? "Abriendo tu espacio…" : "En tus manos."}</p>
    </div>
  </>;
}
