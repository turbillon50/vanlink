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
import { Icon } from "@/components/icons";
import { CryptoMark } from "@/components/brand/crypto-mark";
export default function SwapPage() {
  const [amount, setAmount] = useState(""),
    [reverse, setReverse] = useState(false);
  return (
    <AppShell>
      <TopBar title="Cambiar" backHref="/" />
      <PageIntro
        eyebrow="EN LA MISMA RED"
        title="Un cambio simple"
        description="Revisa la cotización antes de confirmar."
      />
      <div className="form-stack">
        <MoneyInput
          label="Cambias"
          value={amount}
          onChange={setAmount}
          currency={reverse ? "ETH" : "USDC"}
        />
        <button
          className="icon-button mx-auto"
          onClick={() => {
            setReverse(!reverse);
            setAmount("");
          }}
          aria-label="Invertir monedas"
        >
          <Icon name="swap" />
        </button>
        <div className="amount-field">
          <span>Recibes</span>
          <div>
            <span className="text-4xl muted">—</span>
            <strong className="ml-auto currency-label">
              <CryptoMark asset={reverse ? "USDC" : "ETH"} size={32} />
              {reverse ? "USDC" : "ETH"}
            </strong>
          </div>
        </div>
        <div className="summary-panel">
          <SummaryRow label="Red" value="Base" />
          <SummaryRow label="Tipo de cambio" value="Sin cotizar" />
          <SummaryRow label="Costos y mínimo a recibir" value="Sin cotizar" />
        </div>
        <ConnectionNote>
          Las cotizaciones se habilitarán al conectar el servicio de intercambio
          y tu wallet.
        </ConnectionNote>
        <PressButton disabled>Cotización no disponible todavía</PressButton>
      </div>
    </AppShell>
  );
}
