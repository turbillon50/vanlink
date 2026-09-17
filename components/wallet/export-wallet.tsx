"use client";

/**
 * components/wallet/export-wallet.tsx
 * Exportar la frase semilla. Esto es lo que hace que la wallet sea DEL USUARIO
 * y no de VanDeFi: con estas palabras puede abrirla en MetaMask, Trust o
 * cualquier wallet, y dejar de necesitarnos.
 *
 * Candados deliberados:
 *  - Solo el dispositivo autorizado puede firmar la exportación.
 *  - Las palabras se muestran ocultas y hay que descubrirlas a propósito.
 *  - Nunca se copian solas al portapapeles ni se envían a ningún lado.
 *  - Se advierte lo que significa antes de mostrarlas, no después.
 */

import { useState } from "react";

type Wallet = { organizationId: string; walletId: string };

export function ExportWallet({ wallet, verified }: { wallet: Wallet; verified: boolean }) {
  const [phase, setPhase] = useState<"cerrado" | "aviso" | "exportando" | "listo" | "error">("cerrado");
  const [words, setWords] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState("");

  if (!verified) {
    return (
      <div className="exp-box">
        <strong>Exportar tu wallet</strong>
        <p>
          Solo puedes exportar desde el dispositivo autorizado. Ábrelo ahí para
          obtener tu frase de recuperación.
        </p>
      </div>
    );
  }

  if (phase === "listo") {
    return (
      <div className="exp-box exp-open">
        <strong>Tu frase de recuperación</strong>
        <p className="exp-warn-strong">
          Quien tenga estas palabras es dueño de tus fondos. Escríbelas en papel.
          No las guardes en fotos, notas ni chats.
        </p>
        <div className={revealed ? "exp-words" : "exp-words hidden"}>
          {words.map((w, i) => (
            <span key={i}><i>{i + 1}</i>{w}</span>
          ))}
        </div>
        {!revealed ? (
          <button type="button" className="dev-action" onClick={() => setRevealed(true)}>
            Mostrar palabras
          </button>
        ) : (
          <button type="button" className="dev-deny" onClick={() => {
            setWords([]); setRevealed(false); setPhase("cerrado");
          }}>Ya las anoté, ocultar</button>
        )}
        <p className="exp-note">
          Con ellas puedes abrir esta misma wallet en MetaMask, Trust o cualquier
          wallet compatible. Tus fondos no dependen de VanDeFi.
        </p>
      </div>
    );
  }

  if (phase === "aviso") {
    return (
      <div className="exp-box exp-alert">
        <strong>Antes de continuar</strong>
        <ul className="exp-list">
          <li>Vas a ver palabras que dan control total de tus fondos.</li>
          <li>Asegúrate de estar solo y sin cámaras cerca.</li>
          <li>Anótalas en papel. Nunca en una foto ni en un chat.</li>
          <li>Nadie de VanDeFi te las va a pedir jamás.</li>
        </ul>
        <div className="dev-buttons">
          <button type="button" className="dev-deny" onClick={() => setPhase("cerrado")}>
            Cancelar
          </button>
          <button type="button" className="dev-action" onClick={async () => {
            setPhase("exportando"); setMessage("");
            try {
              const { exportWalletMnemonic } = await import("@/lib/wallet/export");
              const frase = await exportWalletMnemonic(wallet);
              setWords(frase.trim().split(/\s+/));
              setPhase("listo");
            } catch (e) {
              setMessage((e as Error).message || "No pudimos exportar la wallet.");
              setPhase("error");
            }
          }}>Entiendo, mostrar mi frase</button>
        </div>
      </div>
    );
  }

  return (
    <div className="exp-box">
      <strong>Exportar tu wallet</strong>
      <p>
        Obtén tu frase de recuperación para abrir esta wallet en cualquier otra app.
        Las palabras se descifran en este dispositivo: ni VanDeFi ni nadie más las ve.
      </p>
      <button type="button" className="dev-deny" disabled={phase === "exportando"}
        onClick={() => setPhase("aviso")}>
        {phase === "exportando" ? "Exportando…" : "Ver mi frase de recuperación"}
      </button>
      {phase === "error" && message ? <p className="dev-error">{message}</p> : null}
    </div>
  );
}
