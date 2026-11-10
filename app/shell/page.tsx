"use client";

import { useEffect, useState } from "react";

const COUNTRIES = [
  "México",
  "Venezuela",
  "Colombia",
  "Argentina",
  "Brasil",
  "España",
  "Estados Unidos",
  "Perú",
  "Chile",
];

export default function ShellPage() {
  const [showSplash, setShowSplash] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(t);
  }, []);

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-white">
        <div className="text-7xl font-light tracking-tight text-emerald-400">V</div>
        <div className="mt-6 text-2xl font-medium tracking-tight">VanDeFi</div>
        <div className="mt-2 text-sm text-neutral-400">Tu dinero. Tu control.</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <button className="h-10 w-10 rounded-xl border border-white/10 text-neutral-300" aria-label="Menú">
          ☰
        </button>
        <div className="text-lg font-semibold tracking-tight">VanDeFi</div>
        <button className="h-10 w-10 rounded-full border border-white/10 text-sm" aria-label="Usuario">
          L
        </button>
      </header>

      <div className="mx-4 mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
        <span className="text-emerald-400">Demo</span>
        <span className="text-neutral-400"> · Regístrate para activar</span>
      </div>

      <main className="px-4 pt-8">
        <p className="mb-4 text-sm text-neutral-400">Selecciona ruta</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="rounded-2xl border border-emerald-500/40 p-4">
            <span className="block text-xs text-neutral-400">De</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-2 w-full bg-transparent text-sm outline-none"
            >
              <option value="">Selecciona país de origen</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c} className="bg-black">
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="rounded-2xl border border-emerald-500/40 p-4">
            <span className="block text-xs text-neutral-400">A</span>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-2 w-full bg-transparent text-sm outline-none"
            >
              <option value="">Selecciona país de destino</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c} className="bg-black">
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-6 text-sm text-neutral-500">
          {from && to
            ? `Ruta: ${from} → ${to}. Opciones reales aquí.`
            : "Elige origen y destino para ver opciones"}
        </p>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex items-center justify-around border-t border-white/10 bg-black/90 px-2 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <span className="text-xs text-emerald-400">Inicio</span>
        <span className="text-xs text-neutral-400">Enviar</span>
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-lg">+</span>
        <span className="text-xs text-neutral-400">Actividad</span>
        <span className="text-xs text-neutral-400">Cuenta</span>
      </nav>
    </div>
  );
}
