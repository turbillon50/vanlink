"use client";
import { PressButton } from "@/components/ui/press-button";
import { EmptyState } from "@/components/craft";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="auth-page">
      <EmptyState
        icon="info"
        title="No pudimos abrir esta pantalla"
        description="Intenta de nuevo. Tus borradores guardados en este dispositivo se conservan."
        action={<PressButton onClick={reset}>Reintentar</PressButton>}
      />
      <PressButton href="/" variant="secondary">
        Volver al inicio
      </PressButton>
    </main>
  );
}
