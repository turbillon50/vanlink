"use client";

import { useEffect, useRef, useState } from "react";
import { PressButton } from "@/components/ui/press-button";
import { RecoveryContactSetup } from "./recovery-contact";
import { RecoverDevice } from "@/components/wallet/recover-device";

type DeviceWallet = { organizationId: string; turnkeyUserId: string; evmAddress: string };
type CheckStatus = "not_checked" | "key_match" | "checking" | "verified" | "key_missing" | "key_mismatch" | "access_unverified" | "signature_rejected" | "signature_invalid" | "approval_required" | "check_unavailable";
type DeviceMetadata = { registeredDeviceFingerprints: string[]; recoveryEmailPresent: boolean };

const messages: Record<CheckStatus, string> = {
  not_checked: "Comprueba que este navegador puede firmar con tu wallet. Sólo firma un mensaje de prueba: no envía fondos ni consume saldo o gas.",
  key_match: "Turnkey reconoció la llave de este navegador para tu wallet. Puedes comprobar la firma por separado.",
  checking: "Comprobando el dispositivo…",
  verified: "Firma comprobada para esta wallet. Esta prueba no envió fondos ni consumió saldo o gas.",
  key_missing: "No encontramos la llave de tu wallet en este navegador. Abre el navegador donde creaste la wallet para conservar el acceso.",
  key_mismatch: "La llave de este navegador no coincide con la registrada en tu wallet. Usa el navegador original; no borres sus datos.",
  access_unverified: "Todavía no pudimos confirmar el acceso de este dispositivo. Puedes volver a comprobarlo; esta prueba no mueve dinero.",
  signature_rejected: "No se autorizó la firma de prueba. No se movió dinero. Copia el diagnóstico para revisar el acceso de este dispositivo.",
  approval_required: "La firma de prueba requiere aprobación antes de poder comprobarla. No se movió dinero. Copia el diagnóstico para revisar este permiso.",
  signature_invalid: "La firma de prueba no coincide con esta wallet. No se movió dinero. Copia el diagnóstico para revisar el acceso.",
  check_unavailable: "No pudimos completar la comprobación. Tu acceso y tu saldo no se modificaron. Inténtalo otra vez o copia el diagnóstico.",
};

export function DeviceCheck({ userId, wallet, onRecovered }: {
  userId: string; wallet: DeviceWallet; onRecovered: () => void;
}) {
  const [status, setStatus] = useState<CheckStatus>("not_checked");
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [recoveryEmailPresent, setRecoveryEmailPresent] = useState<boolean | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const busy = useRef(false);
  const alive = useRef(true);
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; requestController.current?.abort(); };
  }, []);

  async function check(includeSignature: boolean) {
    if (busy.current) return;
    busy.current = true;
    setStatus("checking"); setCopyState("idle"); setCheckedAt(null);
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const { walletDeviceFingerprint, verifyWalletDevice } = await import("@/lib/wallet/browser");
      const localFingerprint = await walletDeviceFingerprint();
      if (!alive.current) return;
      setFingerprint(localFingerprint);
      const response = await fetch("/api/wallet/device", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("device_metadata_unavailable");
      const metadata = await response.json() as DeviceMetadata;
      if (!alive.current) return;
      if (!Array.isArray(metadata.registeredDeviceFingerprints) ||
          !metadata.registeredDeviceFingerprints.every(value => typeof value === "string" && /^[0-9a-f]{16}$/.test(value)) ||
          typeof metadata.recoveryEmailPresent !== "boolean") throw new Error("device_metadata_invalid");
      setRecoveryEmailPresent(metadata.recoveryEmailPresent);
      if (!localFingerprint) { setStatus("key_missing"); return; }
      if (!metadata.registeredDeviceFingerprints.includes(localFingerprint)) { setStatus("key_mismatch"); return; }
      const accessVerified = await verifyWalletDevice(userId, wallet.organizationId, wallet.turnkeyUserId);
      if (!alive.current) return;
      if (!accessVerified) { setStatus("access_unverified"); return; }
      if (!includeSignature) { setStatus("key_match"); return; }
      const { checkWalletSignature } = await import("@/lib/wallet/device-signature");
      const result = await checkWalletSignature(wallet);
      if (!alive.current) return;
      if (result.verified !== true || Number.isNaN(Date.parse(result.checkedAt))) throw new Error("firma_invalida");
      setStatus("verified"); setCheckedAt(result.checkedAt); onRecovered();
    } catch (failure) {
      if (!alive.current) return;
      const code = failure instanceof Error ? failure.message : "";
      setStatus(code === "requiere_aprobacion" ? "approval_required"
        : code === "firma_rechazada" ? "signature_rejected"
        : code === "firma_invalida" || code === "firma_wallet_incorrecta" ? "signature_invalid"
        : code === "dispositivo_no_autorizado" || code === "dispositivo_identidad_incorrecta" ? "access_unverified"
        : "check_unavailable");
    } finally { busy.current = false; }
  }

  async function copyDiagnostic() {
    const diagnostic = JSON.stringify({
      status, deviceFingerprint: fingerprint,
      walletSuffix: wallet.evmAddress.slice(-6),
    }, null, 2);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(diagnostic);
      if (alive.current) setCopyState("copied");
    } catch { if (alive.current) setCopyState("failed"); }
  }

  const needsAccess = status === "key_missing" || status === "key_mismatch" || status === "access_unverified";
  return <div className="recover-box" role="region" aria-label="Comprobar firma del dispositivo">
    <p className="recover-title">Firma de este dispositivo</p>
    <p className="recover-text" role="status" aria-live="polite">{messages[status]}</p>
    {checkedAt && <p className="wallet-activation-note">Comprobada: {new Date(checkedAt).toLocaleString("es-MX")}</p>}
    <PressButton variant="secondary" onClick={() => { void check(false); }} disabled={status === "checking"}>Buscar mi llave en este navegador</PressButton>
    <PressButton onClick={() => { void check(true); }} disabled={status === "checking"}>
      {status === "checking" ? "Comprobando…" : "Comprobar firma"}
    </PressButton>
    {status !== "not_checked" && status !== "checking" && <PressButton variant="secondary" onClick={() => { void copyDiagnostic(); }}>
      {copyState === "copied" ? "Diagnóstico copiado" : "Copiar diagnóstico"}
    </PressButton>}
    {copyState === "failed" && <p className="field-error" role="status">No pudimos copiar el diagnóstico. Inténtalo de nuevo.</p>}
    {(status === "key_match" || status === "verified") && recoveryEmailPresent === false &&
      <RecoveryContactSetup key={userId + wallet.organizationId} userId={userId} organizationId={wallet.organizationId}
        turnkeyUserId={wallet.turnkeyUserId} onSaved={() => setRecoveryEmailPresent(true)}/>}
    {needsAccess && recoveryEmailPresent === false &&
      <p className="recover-text">Esta wallet no tiene correo de recuperación registrado. Usa el navegador original; desde aquí no podemos recuperar la llave por correo.</p>}
    {needsAccess && recoveryEmailPresent === true && <RecoverDevice userId={userId} context="autorizar movimientos"
      onRecovered={() => {
        if (!alive.current) return;
        setStatus("not_checked"); setCheckedAt(null); onRecovered();
      }}/>}
  </div>;
}

