"use client";
import { useState } from "react";
import { PressButton } from "@/components/ui/press-button";
import type { RecoveryContact } from "@/lib/wallet/recovery-contact";

export function RecoveryContactSetup({ userId, organizationId, turnkeyUserId, onSaved }: {
  userId: string; organizationId: string; turnkeyUserId: string; onSaved: () => void;
}) {
  const [contact, setContact] = useState<RecoveryContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    try {
      const { readRecoveryContact, attachRecoveryContact } = await import("@/lib/wallet/recovery-contact");
      const current = contact ?? await readRecoveryContact();
      if (current.userId !== userId || current.organizationId !== organizationId || current.turnkeyUserId !== turnkeyUserId)
        throw new Error("wallet_context_changed");
      if (!contact) { setContact(current); return; }
      await attachRecoveryContact(contact);
      onSaved();
    } catch {
      setContact(null);
      setError("No pudimos confirmar el registro del correo. Vuelve a consultar el estado de tu wallet.");
    } finally { setBusy(false); }
  }
  return <div>
    {contact && <p>Confirmo que quiero usar {contact.email} para autorizar nuevos dispositivos en esta wallet.</p>}
    <PressButton disabled={busy} onClick={() => { void submit(); }}>
      {contact ? "Autorizar este correo con mi llave" : "Preparar correo de recuperación"}
    </PressButton>
    {contact && <PressButton variant="secondary" disabled={busy} onClick={() => setContact(null)}>Cancelar</PressButton>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
