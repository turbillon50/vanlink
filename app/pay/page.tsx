import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import { EmptyState } from "@/components/craft";
export default function PayPage() {
  return (
    <main className="auth-page">
      <TopBar brand lock />
      <EmptyState
        icon="link"
        title="Este enlace no está activo"
        description="Esta dirección no contiene un cobro publicado. Pide a quien te cobra un enlace de pago válido."
        action={<PressButton href="/vanlink">Ir a mis VanLinks</PressButton>}
      />
    </main>
  );
}
