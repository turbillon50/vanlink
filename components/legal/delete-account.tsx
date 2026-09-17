"use client";

/**
 * components/legal/delete-account.tsx
 * Borrado de cuenta con candados: muestra saldos reales antes de permitirlo y
 * exige escribir ELIMINAR. Si el usuario tiene fondos, se advierte con claridad.
 */

import { useEffect, useState } from "react";

type Balance = { token?: string; amount?: string; error?: string };
type BalanceResponse = {
  wallet: { evmAddress: string; bitcoinAddress: string } | null;
  base?: { balances: Balance[] };
  bitcoin?: Balance;
};

export function DeleteAccount() {
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "enviando" | "listo" | "error" | "anon">("idle");
  const [balances, setBalances] = useState<BalanceResponse | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/chain/balance", { cache: "no-store" });
        if (r.status === 401) { setState("anon"); return; }
        if (r.ok) setBalances((await r.json()) as BalanceResponse);
      } catch { /* sin saldos: se advierte igual */ }
    })();
  }, []);

  const conFondos = (() => {
    if (!balances) return false;
    const base = (balances.base?.balances ?? []).some(b => Number(b.amount) > 0);
    const btc = Number(balances.bitcoin?.amount ?? 0) > 0;
    return base || btc;
  })();

  if (state === "anon") {
    return (
      <p className="legal-note">
        Inicia sesión para eliminar tu cuenta desde aquí, o escríbenos por correo.
      </p>
    );
  }

  if (state === "listo") {
    return (
      <p className="legal-note">
        Tu cuenta fue eliminada. Gracias por haber usado VanDeFi.
      </p>
    );
  }

  return (
    <div className="legal-danger">
      {conFondos && (
        <p className="legal-warn">
          Detectamos saldo en tu wallet. Retíralo antes de continuar: después de eliminar
          la cuenta no podremos ayudarte a recuperarlo.
        </p>
      )}
      <label htmlFor="confirmar">
        Escribe <strong>ELIMINAR</strong> para confirmar
      </label>
      <input
        id="confirmar"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="ELIMINAR"
        autoComplete="off"
      />
      <button
        type="button"
        disabled={confirm.trim().toUpperCase() !== "ELIMINAR" || state === "enviando"}
        onClick={async () => {
          setState("enviando");
          try {
            const r = await fetch("/api/account/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirm: "ELIMINAR" }),
            });
            setState(r.ok ? "listo" : "error");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "enviando" ? "Eliminando…" : "Eliminar mi cuenta"}
      </button>
      {state === "error" && (
        <p className="legal-note">
          No pudimos completar la eliminación. Escríbenos a privacidad@vandefi.live.
        </p>
      )}
    </div>
  );
}
