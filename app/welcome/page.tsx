import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { PressButton } from "@/components/ui/press-button";
import { Icon } from "@/components/icons";
export default function WelcomePage() {
  return (
    <main className="welcome-page">
      <header className="welcome-top">
        <Wordmark size={25} />
        <Link href="/" className="text-link">
          Explorar Inicio <Icon name="arrow" size={16} />
        </Link>
      </header>
      <section className="welcome-core">
        <p className="eyebrow">TU DINERO. TU CONTROL.</p>
        <h1>
          Muévelo.
          <br />
          Compártelo.
          <br />
          Hazlo simple.
        </h1>
        <p>
          Tu wallet y tus links de pago.
          <br />
          Todo en un mismo lugar.
        </p>
      </section>
      <div className="welcome-actions">
        <PressButton href="/">
          Ir a Inicio <Icon name="arrow" size={18} />
        </PressButton>
        <PressButton href="/login" variant="secondary">
          Acceso a mi cuenta
        </PressButton>
        <div className="welcome-assets">
          USDT <span>sobre</span> Polygon
        </div>
        <p>Envíos y depósitos en Polygon en pausa.</p>
      </div>
    </main>
  );
}
