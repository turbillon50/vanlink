"use client";
import { useState } from "react";
import { PressButton } from "@/components/ui/press-button";

type Props = { userId: string; onRecovered: () => void; context?: string };

/** Bloque que aparece cuando este dispositivo no puede firmar: recupera el acceso con un código al correo. */
export function RecoverDevice({ userId, onRecovered, context = "firmar" }: Props) {
  const [step, setStep] = useState<"idle" | "sent" | "done">("idle");
  const [otpId, setOtpId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);

  async function send() {
    setBusy(true); setError("");
    try {
      const { sendCode } = await import("@/lib/wallet/recovery");
      const r = await sendCode();
      setOtpId(r.otpId); setEmail(r.email); setStep("sent");
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message); if (err.code === "sin_correo") setBlocked(true);
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setError("");
    try {
      const { recoverWithCode } = await import("@/lib/wallet/recovery");
      await recoverWithCode(userId, otpId, code.trim());
      setStep("done"); onRecovered();
    } catch (e) { setError((e as Error).message || "No se pudo recuperar."); }
    finally { setBusy(false); }
  }

  if (step === "done") return <div className="recover-box ok" role="status">Listo. Este dispositivo ya puede {context}.</div>;

  return (
    <div className="recover-box" role="region" aria-label="Recuperar acceso">
      <p className="recover-title">Este dispositivo todavía no puede {context}.</p>
      {step === "idle" && !blocked && <>
        <p className="recover-text">Te mandamos un código a tu correo y en un minuto queda listo. Tu dinero no se mueve.</p>
        <PressButton onClick={send} disabled={busy}>{busy ? "Enviando…" : "Recuperar con mi correo"}</PressButton>
      </>}
      {step === "sent" && <>
        <p className="recover-text">Escribe el código que llegó a <strong>{email}</strong>.</p>
        <input className="recover-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
          value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Código de 6 dígitos" />
        <PressButton onClick={verify} disabled={busy || code.length !== 6}>{busy ? "Verificando…" : "Confirmar"}</PressButton>
        <button type="button" className="recover-link" onClick={send} disabled={busy}>Mandar otro código</button>
      </>}
      {error && <p role="alert" className="field-error">{error}</p>}
    </div>
  );
}
