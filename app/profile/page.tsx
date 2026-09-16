import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon, type IconName } from "@/components/icons";
import { PressButton } from "@/components/ui/press-button";
const settings: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "user",
    title: "Datos personales",
    text: "Tus datos aparecerán aquí cuando inicies sesión. Esta instalación todavía no tiene habilitado el acceso a cuentas.",
  },
  {
    icon: "shield",
    title: "Seguridad",
    text: "El acceso y las opciones de seguridad se habilitarán con tu cuenta. Por ahora no hay una sesión ni una wallet conectada.",
  },
  {
    icon: "wallet",
    title: "Recuperación de mi wallet",
    text: "Las opciones de recuperación dependerán de la wallet que se configure. Aún no se ha creado ninguna wallet en esta versión.",
  },
  {
    icon: "globe",
    title: "Moneda y red",
    text: "La red principal de VanDeFi es Base y el activo principal es USDC. Los importes muestran siempre su moneda para evitar confusiones.",
  },
];
export default function ProfilePage() {
  return (
    <AppShell>
      <TopBar title="Mi cuenta" backHref="/" />
      <div className="profile-card">
        <span className="avatar">
          <Icon name="user" size={29} />
        </span>
        <div>
          <h2>Tu espacio</h2>
          <p>Cuenta sin conectar</p>
        </div>
      </div>
      <div className="settings-group">
        {settings.map((s) => (
          <details key={s.title}>
            <summary>
              <Icon name={s.icon} size={19} />
              <span>{s.title}</span>
              <Icon name="chevron" size={17} />
            </summary>
            <p>{s.text}</p>
          </details>
        ))}
      </div>
      <PressButton href="/login">Ver acceso a mi cuenta</PressButton>
      <div className="connection-note">
        <p>
          Los borradores que prepares se guardan solo en este navegador. No
          contienen fondos.
        </p>
      </div>
      <PressButton href="/welcome" variant="secondary">
        Conocer VanDeFi
      </PressButton>
    </AppShell>
  );
}
