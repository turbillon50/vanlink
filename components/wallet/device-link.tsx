"use client";

/**
 * components/wallet/device-link.tsx
 * Vincular un segundo dispositivo. Dos caras según dónde esté el usuario:
 *
 *  - Dispositivo NO autorizado: pide un código y lo muestra para comparar.
 *  - Dispositivo AUTORIZADO: ve la solicitud pendiente, compara el código
 *    y firma la autorización con su propia llave.
 *
 * El código de 6 dígitos existe para que el usuario compare a simple vista.
 * Sin esa comparación, alguien que entrara a la cuenta podría pedir alta de
 * su propio dispositivo y el dueño aprobaría a ciegas.
 */

import { useCallback, useEffect, useState } from "react";

type Wallet = { organizationId: string; turnkeyUserId: string };
type Pending = { id: string; publicKey: string; code: string; label: string; expiresAt: string };

export function DeviceLink({ wallet, verified }: { wallet: Wallet; verified: boolean }) {
  return verified
    ? <ApproverSide wallet={wallet} />
    : <RequesterSide />;
}

/* ── Cara A: dispositivo nuevo, pide permiso ─────────────────────────────── */
function RequesterSide() {
  const [state, setState] = useState<"idle" | "pidiendo" | "esperando" | "listo" | "error">("idle");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async () => {
    setState("pidiendo");
    setMessage("");
    try {
      const { prepareWalletDevice } = await import("@/lib/wallet/browser");
      const { userId } = await (await fetch("/api/wallet", { cache: "no-store" })).json()
        .then((d: { wallet?: { turnkeyUserId?: string } }) => ({ userId: d.wallet?.turnkeyUserId }))
        .catch(() => ({ userId: undefined }));
      void userId;

      // Llave propia de ESTE navegador. La mitad privada nunca sale de aquí.
      const publicKey = await prepareWalletDevice(crypto.randomUUID());
      const response = await fetch("/api/wallet/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey, label: navigator.platform || "Dispositivo nuevo" }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error === "ya_hay_solicitud"
          ? "Ya hay una solicitud pendiente. Apruébala o espera a que expire."
          : "No pudimos crear la solicitud.");
        setState("error");
        return;
      }
      setCode(data.code);
      setState("esperando");
    } catch {
      setMessage("No pudimos preparar este dispositivo.");
      setState("error");
    }
  }, []);

  // Mientras espera, revisa si ya fue aprobado.
  useEffect(() => {
    if (state !== "esperando") return;
    const timer = window.setInterval(async () => {
      try {
        const r = await fetch("/api/wallet", { cache: "no-store" });
        const d = await r.json();
        if (d?.wallet) {
          const { confirmDeviceAuthorized } = await import("@/lib/wallet/browser");
          const ok = await confirmDeviceAuthorized(d.wallet.organizationId, d.wallet.turnkeyUserId)
            .catch(() => false);
          if (ok) { setState("listo"); window.clearInterval(timer); }
        }
      } catch { /* reintenta en el siguiente ciclo */ }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [state]);

  if (state === "listo") {
    return (
      <div className="dev-box dev-ok">
        <strong>Dispositivo autorizado</strong>
        <p>Ya puedes operar desde aquí. Recarga la pantalla para verlo reflejado.</p>
      </div>
    );
  }

  if (state === "esperando") {
    return (
      <div className="dev-box">
        <strong>Confirma este código en tu otro dispositivo</strong>
        <div className="dev-code" aria-label="Código de verificación">
          {code.split("").map((n, i) => <span key={i}>{n}</span>)}
        </div>
        <p>
          Abre VanDeFi en el dispositivo donde ya está tu wallet, ve a Mi cuenta y
          aprueba la solicitud. El código debe coincidir exactamente. Expira en 10 minutos.
        </p>
      </div>
    );
  }

  return (
    <div className="dev-box">
      <strong>Usar la wallet desde este dispositivo</strong>
      <p>
        Tu wallet está vinculada a otro dispositivo. Para operar desde aquí necesitas
        autorizarlo desde el original: nadie más puede hacerlo, ni nosotros.
      </p>
      <button type="button" className="dev-action" onClick={request} disabled={state === "pidiendo"}>
        {state === "pidiendo" ? "Preparando…" : "Solicitar autorización"}
      </button>
      {message ? <p className="dev-error">{message}</p> : null}
    </div>
  );
}

/* ── Cara B: dispositivo dueño, aprueba ──────────────────────────────────── */
function ApproverSide({ wallet }: { wallet: Wallet }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [state, setState] = useState<"idle" | "firmando" | "hecho" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch("/api/wallet/device", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { request: Pending | null };
        if (active) setPending(d.request);
      } catch { /* silencio: no es crítico */ }
    };
    void load();
    const timer = window.setInterval(load, 6000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (!pending) return null;

  const resolve = async (resultado: "aprobada" | "rechazada") => {
    setState("firmando");
    setMessage("");
    try {
      if (resultado === "aprobada") {
        const { authorizeSecondDevice } = await import("@/lib/wallet/browser");
        await authorizeSecondDevice({
          organizationId: wallet.organizationId,
          turnkeyUserId: wallet.turnkeyUserId,
          publicKey: pending.publicKey,
          label: pending.label,
        });
      }
      const r = await fetch("/api/wallet/device", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pending.id, resultado }),
      });
      if (!r.ok) throw new Error("patch");
      setState("hecho");
      setPending(null);
    } catch {
      setMessage("No pudimos completar la autorización. Vuelve a intentarlo.");
      setState("error");
    }
  };

  if (state === "hecho") {
    return <div className="dev-box dev-ok"><strong>Listo</strong><p>La solicitud quedó resuelta.</p></div>;
  }

  return (
    <div className="dev-box dev-alert">
      <strong>Un dispositivo quiere acceder a tu wallet</strong>
      <p>
        Verifica que este código sea idéntico al que ves en el otro dispositivo.
        <b> Si no coincide, recházalo</b>: alguien más podría estar intentando entrar.
      </p>
      <div className="dev-code" aria-label="Código a verificar">
        {pending.code.split("").map((n, i) => <span key={i}>{n}</span>)}
      </div>
      <p className="dev-meta">{pending.label}</p>
      <div className="dev-buttons">
        <button type="button" className="dev-deny" disabled={state === "firmando"}
          onClick={() => resolve("rechazada")}>Rechazar</button>
        <button type="button" className="dev-action" disabled={state === "firmando"}
          onClick={() => resolve("aprobada")}>
          {state === "firmando" ? "Autorizando…" : "Sí, soy yo. Autorizar"}
        </button>
      </div>
      {message ? <p className="dev-error">{message}</p> : null}
    </div>
  );
}
