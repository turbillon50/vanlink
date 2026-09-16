import { Logo } from "./logo";

export function Atmosphere() {
  return <div className="ambient-light" aria-hidden="true"><i /><i /></div>;
}

export function BrandSculpture({ compact = false }: { compact?: boolean }) {
  return (
    <div className={"brand-sculpture" + (compact ? " compact" : "")} aria-hidden="true">
      <span className="sculpture-aura" />
      <span className="sculpture-rim" />
      <div className="sculpture-mark"><Logo size={174} /></div>
      <div className="sculpture-reflection"><Logo size={174} glow={false} /></div>
      <span className="sculpture-floor" />
    </div>
  );
}

export function SplashContent({ loading = false }: { loading?: boolean }) {
  return <>
    <div className="splash-haze" aria-hidden="true" />
    <span className="splash-edition" aria-hidden="true">VANDEFI / TU DINERO, TU CONTROL</span>
    <div className="splash-center">
      <BrandSculpture />
      <h1>VanDeFi</h1>
      <p>Todo empieza con un link.</p>
    </div>
    <div className="splash-bottom">
      <div className="splash-loader" aria-hidden="true" />
      <p>{loading ? "Abriendo tu espacio…" : "En tus manos."}</p>
    </div>
  </>;
}
