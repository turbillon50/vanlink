"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type WalletMode = "simple" | "expert";

type WalletModeContextValue = {
  mode: WalletMode;
  setMode: (mode: WalletMode) => void;
};

const STORAGE_KEY = "vandefi.experience.mode.v1";
const WalletModeContext = createContext<WalletModeContextValue | null>(null);

/** Preferencia de interfaz, nunca modifica las autorizaciones financieras. */
export function WalletModeProvider({ children }: { children: ReactNode }) {
  const [mode, setCurrentMode] = useState<WalletMode>("simple");

  // Se lee después de la hidratación: el HTML inicial es idéntico
  // en servidor y cliente, incluso en una PWA sin sesión.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "simple" || stored === "expert") setCurrentMode(stored);
    } catch {
      // Sin almacenamiento persistente seguimos en el modo seguro.
    }
  }, []);

  const setMode = useCallback((value: WalletMode) => {
    setCurrentMode(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* privado */ }
  }, []);

  return (
    <WalletModeContext.Provider value={{ mode, setMode }}>
      {children}
    </WalletModeContext.Provider>
  );
}

export function useWalletMode() {
  const context = useContext(WalletModeContext);
  if (!context) throw new Error("WalletModeProvider no está instalado");
  return context;
}

export function ModeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useWalletMode();
  return (
    <div
      className={compact ? "vd-mode-switch compact" : "vd-mode-switch"}
      role="group"
      aria-label="Modo de experiencia"
    >
      <button type="button" aria-pressed={mode === "simple"} onClick={() => setMode("simple")}>
        Simple
      </button>
      <button type="button" aria-pressed={mode === "expert"} onClick={() => setMode("expert")}>
        Experto
      </button>
    </div>
  );
}
