"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { PressButton } from "@/components/ui/press-button";
import {
  PageIntro,
  MoneyInput,
  ConnectionNote,
  SummaryRow,
} from "@/components/craft";
export default function BuyPage() {
  const [mode, setMode] = useState("buy"),
    [amount, setAmount] = useState("");
  const buy = mode === "buy";
  return (
    <AppShell>
      <TopBar title="Comprar y vender" backHref="/" />
      <PageIntro
        eyebrow="CRYPTO Y TU MONEDA"
        title={buy ? "De pesos a USDC" : "De USDC a pesos"}
        description="Consulta las opciones disponibles antes de continuar."
      />
      <div className="form-stack">
        <div className="filter-row" aria-label="Tipo de operación">
          {[
            ["buy", "Comprar"],
            ["sell", "Vender"],
          ].map(([v, l]) => (
            <button
              key={v}
              aria-pressed={mode === v}
              onClick={() => {
                setMode(v);
                setAmount("");
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <MoneyInput
          label={buy ? "Pagas" : "Vendes"}
          value={amount}
          onChange={setAmount}
          currency={buy ? "MXN" : "USDC"}
        />
        <div className="summary-panel">
          <SummaryRow label="Recibes" value={buy ? "USDC en Base" : "MXN"} />
          <SummaryRow label="País" value="México" />
          <SummaryRow
            label="Cotización y métodos"
            value="Pendientes de conexión"
          />
        </div>
        <ConnectionNote>
          La compra y venta con fiat se habilitará al conectar Onramper. No se
          ha iniciado ninguna operación.
        </ConnectionNote>
        <PressButton disabled>Opciones no disponibles todavía</PressButton>
      </div>
    </AppShell>
  );
}
