import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { CryptoMark } from "@/components/brand/crypto-mark";
import { PressButton } from "@/components/ui/press-button";
import { Icon } from "@/components/icons";
export default function WelcomePage() {
  return (
    <main className="welcome-page">
      <header className="welcome-top">
        <Wordmark size={25} />
        <Link href="/" className="text-link">
          Explorar <Icon name="arrow" size={16} />
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
          Conocer mi nueva wallet <Icon name="arrow" size={18} />
        </PressButton>
        <PressButton href="/login" variant="secondary">
          Acceso a mi cuenta
        </PressButton>
        <div className="welcome-assets">
          <CryptoMark asset="USDC" size={32} /> USDC <span>sobre</span>{" "}
          <CryptoMark asset="BASE" size={22} /> Base
        </div>
        <p>Las operaciones están en preparación.</p>
      </div>
    </main>
  );
}
