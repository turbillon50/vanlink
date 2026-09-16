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
      <span className="sculpture-corona" />
      <span className="sculpture-lens" />
      <svg className="energy-trails" viewBox="0 0 360 360" fill="none">
        <g transform="rotate(-32 180 180)">
          <ellipse className="energy-track" cx="180" cy="180" rx="159" ry="67" />
          <ellipse className="energy-current current-one" cx="180" cy="180" rx="159" ry="67" pathLength="100" />
        </g>
        <g transform="rotate(38 180 180)">
          <ellipse className="energy-track track-cyan" cx="180" cy="180" rx="142" ry="62" />
          <ellipse className="energy-current current-two" cx="180" cy="180" rx="142" ry="62" pathLength="100" />
        </g>
      </svg>
      <span className="sculpture-orbit orbit-one" />
      <span className="sculpture-orbit orbit-two" />
      <div className="sculpture-mark">
        <Logo size={144} />
      </div>
      <span className="sculpture-floor" />
      <span className="sculpture-ripple" />
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
      <div className="splash-horizon" aria-hidden="true" />
      <div className="splash-center">
        <BrandSculpture />
        <h1>VanDeFi</h1>
        <p>Tu dinero. Tu control.</p>
        <span className="splash-signature">EN TUS MANOS.</span>
      </div>
      <div className="splash-bottom">
        <div className="splash-loader" aria-hidden="true" />
        <p>{loading ? "Abriendo tu espacio…" : "Todo empieza contigo."}</p>
      </div>
    </>
  );
}
