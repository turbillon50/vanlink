"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";

export function CopyIdentity({ userId }: { userId: string }) {
  const [status, setStatus] = useState("");
  const session = useAuth();
  if (!session.isLoaded) return <p role="status">Comprobando identidad de la sesión…</p>;
  if (session.userId !== userId) return <p role="alert">La sesión cambió. Actualiza esta página antes de copiar el identificador.</p>;
  async function copy() {
    try { await navigator.clipboard.writeText(userId); setStatus("Identificador copiado."); }
    catch { setStatus("No se pudo copiar. Selecciona el identificador y cópialo manualmente."); }
  }
  return <div className="adm-identity-copy"><label htmlFor="admin-own-id">Tu identificador Clerk</label><input id="admin-own-id" value={userId} readOnly autoComplete="off" onFocus={event => event.currentTarget.select()}/><button className="adm-button" type="button" onClick={() => { void copy(); }}>Copiar identificador</button><p role="status" aria-live="polite">{status}</p></div>;
}
