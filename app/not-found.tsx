import { PressButton } from "@/components/ui/press-button";
import { EmptyState } from "@/components/craft";
export default function NotFound() {
  return (
    <main className="auth-page">
      <EmptyState
        icon="link"
        title="Por aquí no es"
        description="La pantalla que buscas no existe o el enlace cambió."
        action={<PressButton href="/">Ir al inicio</PressButton>}
      />
    </main>
  );
}
