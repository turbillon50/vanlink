import test from "node:test";
import assert from "node:assert/strict";
import { REMITTANCE_RAILS, canReceive, canSend, rankRemittanceQuotes } from "../lib/remittance/rail-policy.ts";

const now = 1794200000000;
const request = {
  inputAsset: "USDT",
  inputAmount: "10",
  nowMs: now,
  allowedRails: ["tron", "solana", "base", "bitcoin", "ethereum"],
  scope: "crypto-delivery",
};

function quote(overrides = {}) {
  return {
    quoteId: "q-1",
    providerId: "provider-approved",
    inputAsset: "USDT",
    inputAmount: "10",
    destinationRail: "base",
    destinationAsset: "USDT",
    netRecipientUsd: 9.8,
    totalFeeUsd: 0.2,
    expiresAtMs: now + 120_000,
    executable: true,
    payeeSupportsRail: true,
    approvedProvider: true,
    scope: "crypto-delivery",
    ...overrides,
  };
}

test("Solana y TRON son prioridad de arquitectura, pero no se ofrecen para depósitos antes de QA", () => {
  assert.equal(REMITTANCE_RAILS.solana.purpose, "remittance-candidate");
  assert.equal(REMITTANCE_RAILS.tron.purpose, "remittance-candidate");
  assert.equal(canReceive("solana", "USDC"), false);
  assert.equal(canSend("tron", "USDT"), false);
});

test("EVM de Base y Ethereum no son sinónimos de red autorizada", () => {
  assert.equal(canReceive("base", "USDC"), true);
  assert.equal(canReceive("ethereum", "USDC"), false);
  assert.equal(canSend("base", "USDT"), true);
  assert.equal(canSend("ethereum", "USDT"), false);
});

test("BTC envuelto en Base se registra como cbBTC, no como BTC nativo", () => {
  assert.equal(canReceive("base", "BTC"), false);
  assert.equal(canReceive("base", "cbBTC"), true);
  assert.equal(canReceive("bitcoin", "BTC"), true);
  assert.equal(canReceive("bitcoin", "cbBTC"), false);
});

test("NO se ofrece USDC en TRON", () => {
  assert.equal(REMITTANCE_RAILS.tron.assets.includes("USDC"), false);
  assert.equal(canReceive("tron", "USDC"), false);
});

test("quotes falsos, expirados, no aprobados o sin soporte del destinatario no se usan", () => {
  assert.deepEqual(rankRemittanceQuotes(request, [
    quote({ quoteId: "expired", expiresAtMs: now }),
    quote({ quoteId: "no-approval", approvedProvider: false }),
    quote({ quoteId: "not-executable", executable: false }),
    quote({ quoteId: "wrong-dest", payeeSupportsRail: false }),
    quote({ quoteId: "future-tron", destinationRail: "tron" }),
    quote({ quoteId: "wrong-input", inputAmount: "20" }),
    quote({ quoteId: "wrong-asset", inputAsset: "USDC" }),
    quote({ quoteId: "wrong-output", destinationAsset: "USDC", destinationRail: "bitcoin" }),
    quote({ quoteId: "allowed" }),
  ]).map(x => x.quoteId), ["allowed"]);
});

test("ordena por dinero neto al destinatario, no por precio anunciado ni favoritismo de cadena", () => {
  const ranked = rankRemittanceQuotes(request, [
    quote({ quoteId: "less", netRecipientUsd: 9.55, totalFeeUsd: 0.01 }),
    quote({ quoteId: "more", netRecipientUsd: 9.82, totalFeeUsd: 0.18 }),
    quote({ quoteId: "tie-low-fee", netRecipientUsd: 9.82, totalFeeUsd: 0.12 }),
  ]);
  assert.deepEqual(ranked.map(x => x.quoteId), ["tie-low-fee", "more", "less"]);
});

test("fiat payout bloqueado mientras no haya pagador autorizado", () => {
  const fiat = { ...request, scope: "fiat-payout" };
  assert.deepEqual(rankRemittanceQuotes(fiat, [
    quote({ scope: "fiat-payout", quoteId: "pretend-bank" }),
  ]), []);
});

test("no admite cotizaciones sin cifras finitas ni importes inválidos", () => {
  assert.deepEqual(rankRemittanceQuotes(request, [
    quote({ netRecipientUsd: Number.NaN }),
    quote({ totalFeeUsd: -1 }),
    quote({ totalFeeUsd: Infinity }),
  ]), []);
  assert.deepEqual(rankRemittanceQuotes({ ...request, inputAmount: "0" }, [quote()]), []);
  assert.deepEqual(rankRemittanceQuotes({ ...request, inputAmount: "10 USDT" }, [quote()]), []);
});
