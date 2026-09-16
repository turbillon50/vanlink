import { Logo } from "./logo";

export function Atmosphere() {
  return (
    <div className="ambient-light" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

export function BrandSculpture({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={"brand-sculpture" + (compact ? " compact" : "")}
      aria-hidden="true"
    >
      <span className="sculpture-aura" />
      <span className="sculpture-orbit orbit-one" />
      <span className="sculpture-orbit orbit-two" />
      <div className="sculpture-mark">
        <Logo size={144} />
      </div>
      <span className="sculpture-floor" />
      <span className="sculpture-particle particle-one" />
      <span className="sculpture-particle particle-two" />
      <span className="sculpture-particle particle-three" />
    </div>
  );
}

export function SplashContent({ loading = false }: { loading?: boolean }) {
  return (
    <>
      <div className="splash-haze" aria-hidden="true" />
      <div className="splash-center">
        <BrandSculpture />
        <h1>VanDeFi</h1>
        <p>Tu dinero. Tu control.</p>
      </div>
      <div className="splash-bottom">
        <div className="splash-loader" aria-hidden="true" />
        <p>{loading ? "Abriendo tu espacio…" : "Todo empieza contigo."}</p>
      </div>
    </>
  );
}

/** Decorative entrance; no API wait and no click interception. Lives in the
 * root layout, so navigation does not replay it. CSS alone dismisses it. */
export function BrandEntrance() {
  return (
    <div className="splash brand-entrance" aria-hidden="true">
      <SplashContent />
    </div>
  );
}
