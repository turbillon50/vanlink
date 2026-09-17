/**
 * scripts/test-webhook-signature.mts
 * Prueba REAL de la verificación de firma del webhook, importando la
 * función tal cual vive en lib/fiat/onramper.ts (no una reimplementación
 * paralela). Corre dos casos:
 *   1. Body firmado correctamente con el secret -> debe ACEPTAR.
 *   2. Mismo body, firma inválida -> debe RECHAZAR.
 *
 * Uso: npx tsx scripts/test-webhook-signature.mts
 */
import crypto from "node:crypto";
import { verifyOnramperWebhookSignature } from "../lib/fiat/onramper";
import { mapOnramperStatus } from "../lib/fiat/types";
import type { OnramperWebhookPayload } from "../lib/fiat/types";

const SECRET = "test_webhook_secret_vandefi_2026";

const payload: OnramperWebhookPayload = {
  transactionId: "tx_7f3c9e1a",
  apiKey: "pk_test_dummy",
  transactionType: "buy",
  status: "completed",
  statusDate: new Date().toISOString(),
  sourceCurrency: "MXN",
  targetCurrency: "USDT_BASE",
  inAmount: 1000,
  outAmount: 55.32,
  walletAddress: "0xTurnkeyAddressDeEjemplo",
};

const rawBody = JSON.stringify(payload);

function run() {
  console.log("=== Caso 1: firma VÁLIDA ===");
  const validSignature = crypto.createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");
  const acceptedValid = verifyOnramperWebhookSignature(rawBody, validSignature, SECRET);
  console.log("Signature enviada:", validSignature);
  console.log("Resultado verifyOnramperWebhookSignature():", acceptedValid);
  console.log("status mapeado ->", mapOnramperStatus(payload.status));
  console.log(acceptedValid ? "✅ ACEPTADA (correcto)" : "❌ FALLO: debía aceptar y no aceptó");

  console.log("\n=== Caso 2: firma INVÁLIDA ===");
  const tamperedSignature = crypto
    .createHmac("sha256", "secret_incorrecto_o_robado")
    .update(rawBody, "utf8")
    .digest("hex");
  const acceptedInvalid = verifyOnramperWebhookSignature(rawBody, tamperedSignature, SECRET);
  console.log("Signature enviada (con secret equivocado):", tamperedSignature);
  console.log("Resultado verifyOnramperWebhookSignature():", acceptedInvalid);
  console.log(!acceptedInvalid ? "✅ RECHAZADA (correcto)" : "❌ FALLO DE SEGURIDAD: aceptó una firma inválida");

  console.log("\n=== Caso 3: sin header de firma ===");
  const acceptedMissing = verifyOnramperWebhookSignature(rawBody, null, SECRET);
  console.log("Resultado con header ausente:", acceptedMissing);
  console.log(!acceptedMissing ? "✅ RECHAZADA (correcto)" : "❌ FALLO: aceptó sin firma");

  const allGood = acceptedValid && !acceptedInvalid && !acceptedMissing;
  console.log("\n" + (allGood ? "TODO OK — arnés confiable." : "HAY UN PROBLEMA — revisar."));
  process.exit(allGood ? 0 : 1);
}

run();
