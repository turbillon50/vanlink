import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import { Icon } from "@/components/icons";
export default function LoginPage() {
  return (
    <main className="auth-page">
      <TopBar brand backHref="/welcome" right={<span />} />
      <div className="auth-intro">
        <span className="preview-link-orb">
          <Icon name="user" size={33} />
        </span>
        <p className="eyebrow">BIENVENIDO A VANDEFI</p>
        <h1>
          Tu cuenta.
          <br />
          Todo a la mano.
        </h1>
        <p>Un solo acceso para tu wallet y tus VanLinks.</p>
      </div>
      <section className="access-status">
        <h2>El acceso está en preparación</h2>
        <p>
          Esta instalación todavía no tiene conectado el inicio de sesión.
          Puedes explorar la app y preparar borradores; las operaciones con
          dinero se habilitarán después.
        </p>
        <PressButton href="/">Explorar VanDeFi</PressButton>
      </section>
      <PressButton variant="secondary" href="/vanlink/create">
        Preparar un VanLink
      </PressButton>
    </main>
  );
}
