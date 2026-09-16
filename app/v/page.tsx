"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Icon } from "@/components/icons";

const prompts = [
  "Ayúdame a crear un VanLink",
  "¿Qué mueve Bitcoin hoy?",
  "Explícame cómo recibir en Colombia",
];

export default function VPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <AppShell>
      <TopBar title="V" />
      <section className="v-page v-folio">
        <div className="v-orbit" aria-hidden="true"><i /><i /><span>V</span></div>
        <p className="eyebrow">V / GUÍA DE VANDEFI</p>
        <h2>Pregunta.<br />V te orienta.</h2>
        <p className="v-lead">Una capa de ayuda para entender rutas, activos y tus próximos pasos sin salir de tu wallet.</p>
        <div className="v-prompt-list">
          {prompts.map((prompt) => (
            <button key={prompt} type="button" onClick={() => { setSelected(prompt); setQuery(prompt); }} className={selected === prompt ? "v-prompt active" : "v-prompt"}>
              <Icon name="spark" size={17} /><span>{prompt}</span><Icon name="arrow" size={15} />
            </button>
          ))}
        </div>
        <form className="v-composer" onSubmit={(event) => { event.preventDefault(); if (query.trim()) setSelected(query.trim()); }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Escribe lo que necesitas…" aria-label="Pregunta a V" />
          <button type="submit" disabled={!query.trim()} aria-label="Enviar pregunta"><Icon name="send" size={17} /></button>
        </form>
        {selected && <p className="v-disclosure">V abrirá esta guía contextual cuando conectemos el motor de conversación. No ejecutará movimientos ni usará tu wallet sin tu confirmación.</p>}
      </section>
    </AppShell>
  );
}
