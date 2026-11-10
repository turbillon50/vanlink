"use client";
import { useState } from "react";
import { PressButton } from "@/components/ui/press-button";
import { walletSession } from "@/lib/wallet/session";

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
    const sessionToken = walletSession.capture();
    setBusy(true); setError("");
    try {
      const { assertRecoveryDeviceAvailable, sendCode } = await import("@/lib/wallet/recovery");
      await assertRecoveryDeviceAvailable(userId);
      walletSession.assert(sessionToken, userId);
      const r = await sendCode(userId);
      walletSession.assert(sessionToken, userId);
      setOtpId(r.otpId); setEmail(r.email); setStep("sent");
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.message === "wallet_device_owner_mismatch" || err.message === "wallet_device_legacy_unknown") {
        setBlocked(true);
        setError(err.message === "wallet_device_owner_mismatch"
          ? "Este navegador conserva la llave de otra cuenta. Para protegerla, recupera esta cuenta en otro navegador."
          : "Este navegador conserva una llave antigua sin identificar. Para protegerla, recupera tu cuenta en otro navegador.");
      } else {
        setError(err.code === "sin_correo" || err.code === "correo_distinto" ? err.message : "No pudimos mandar el código. Intenta de nuevo.");
        if (err.code === "sin_correo") setBlocked(true);
      }
    } finally { setBusy(false); }
  }

  async function verify() {
    const sessionToken = walletSession.capture();
    setBusy(true); setError("");
    try {
      const { recoverWithCode } = await import("@/lib/wallet/recovery");
      walletSession.assert(sessionToken, userId);
      await recoverWithCode(userId, otpId, code.trim());
      walletSession.assert(sessionToken, userId);
      setStep("done"); onRecovered();
    } catch (e) {
      const message = (e as Error).message;
      setError(message === "wallet_device_owner_mismatch"
        ? "Este navegador conserva una llave de otra cuenta. Para protegerla, recupera esta cuenta en otro navegador."
        : message === "wallet_device_legacy_unknown"
        ? "Este navegador conserva una llave antigua sin identificar. Para protegerla, recupera tu cuenta en otro navegador."
        : "No se pudo registrar este dispositivo. Revisa el código e intenta de nuevo.");
    }
    finally { setBusy(false); }
  }

  if (step === "done") return <div className="recover-box ok" role="status">Dispositivo registrado. Comprueba su firma antes de operar.</div>;

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
