/**
 * app/api/onramp/webhook/route.ts
 * Recibe los webhooks de Onramper. Configurar esta URL en el dashboard de
 * Onramper como: https://vandefi.live/api/onramp/webhook
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ONRAMPER_SIGNATURE_HEADER,
  isOnramperConfigured,
  readOnramperEnv,
  verifyOnramperWebhookSignature,
} from "@/lib/fiat/onramper";
import { persistOnramperWebhookEvent } from "@/lib/fiat/activity-store";
import type { OnramperWebhookPayload } from "@/lib/fiat/types";

export const runtime = "nodejs"; // necesita node:crypto para HMAC

export async function POST(req: NextRequest) {
  const env = readOnramperEnv();

  // Degradación elegante: si falta el secret, ni intentamos "confiar a
  // medias" en el payload. 503 explícito, log claro, no tocar la DB.
  if (!isOnramperConfigured() || !env.webhookSecret) {
    console.error(
      "[onramp/webhook] ONRAMPER_API_KEY u ONRAMPER_WEBHOOK_SECRET no configurados — rechazando webhook."
    );
    return NextResponse.json(
      { error: "onramper_not_configured" },
      { status: 503 }
    );
  }

  // CRÍTICO: leer el body como texto CRUDO. Si usas `await req.json()`
  // primero y luego re-serializas para verificar, la firma puede no
  // matchear (orden de keys, espacios, etc.). Se verifica sobre el string
  // exacto que mandó Onramper.
  const rawBody = await req.text();
  const signature = req.headers.get(ONRAMPER_SIGNATURE_HEADER);

  const isValid = verifyOnramperWebhookSignature(rawBody, signature, env.webhookSecret);

  if (!isValid) {
    console.warn("[onramp/webhook] Firma inválida — 401, no se procesa.", {
      hasSignatureHeader: Boolean(signature),
    });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: OnramperWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!payload.transactionId || !payload.status || !payload.statusDate) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  try {
    const result = await persistOnramperWebhookEvent(rawBody, payload);
    // 200 en todos los casos "manejados" (incluyendo duplicado) — Onramper
    // no debe reintentar algo que ya procesamos.
    return NextResponse.json({ received: true, outcome: result.outcome }, { status: 200 });
  } catch (err) {
    console.error("[onramp/webhook] Error al persistir:", err);
    // 500 real -> Onramper reintentará. Correcto: si no pudimos guardar,
    // sí queremos el reintento (el dedupe por event_hash evita duplicados).
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }
}
