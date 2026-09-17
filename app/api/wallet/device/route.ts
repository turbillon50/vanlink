/**
 * app/api/wallet/device/route.ts
 * Transporte de solicitudes de alta de un segundo dispositivo.
 *
 * SEGURIDAD — lo que este endpoint NO hace, a propósito:
 *  - No autoriza nada. Solo guarda una llave pública y un código de verificación.
 *  - No toca Turnkey. La firma ocurre en el navegador que ya es dueño.
 *  - No expone llaves privadas: la mitad privada nunca sale del dispositivo nuevo.
 *
 * POST  → el dispositivo NUEVO registra su llave y recibe un código de 6 dígitos.
 * GET   → el dispositivo AUTORIZADO consulta si hay una solicitud pendiente.
 * PATCH → el dispositivo AUTORIZADO marca el resultado tras firmar (o rechazar).
 */
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { deviceRequests, wallets } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

const TTL_MINUTOS = 10;
const P256 = /^0[23][0-9a-fA-F]{64}$/;

/** Marca como expiradas las solicitudes vencidas antes de cualquier lectura. */
async function caducar(userId: string) {
  await db()
    .update(deviceRequests)
    .set({ status: "expirada" })
    .where(and(
      eq(deviceRequests.clerkUserId, userId),
      eq(deviceRequests.status, "pendiente"),
      lt(deviceRequests.expiresAt, new Date()),
    ));
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "no_autenticado" }, { status: 401, headers });

  let body: { publicKey?: string; label?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400, headers });
  }
  if (!body.publicKey || !P256.test(body.publicKey)) {
    return NextResponse.json({ error: "llave_invalida" }, { status: 400, headers });
  }

  const wallet = (await db().select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0];
  if (!wallet) {
    return NextResponse.json({ error: "sin_wallet" }, { status: 409, headers });
  }

  await caducar(userId);

  // Código legible de 6 dígitos, generado con aleatoriedad criptográfica.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const label = (body.label || "Dispositivo nuevo").slice(0, 40);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TTL_MINUTOS * 60_000);

  try {
    await db().insert(deviceRequests).values({
      id, clerkUserId: userId, publicKey: body.publicKey, code, label, expiresAt,
    });
  } catch {
    // El índice único impide más de una pendiente por usuario.
    return NextResponse.json({ error: "ya_hay_solicitud" }, { status: 409, headers });
  }

  return NextResponse.json({ id, code, expiresAt: expiresAt.toISOString() }, { headers });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "no_autenticado" }, { status: 401, headers });

  await caducar(userId);
  const pending = (await db().select().from(deviceRequests).where(and(
    eq(deviceRequests.clerkUserId, userId),
    eq(deviceRequests.status, "pendiente"),
  )))[0];

  if (!pending) return NextResponse.json({ request: null }, { headers });

  return NextResponse.json({
    request: {
      id: pending.id,
      publicKey: pending.publicKey,
      code: pending.code,
      label: pending.label,
      expiresAt: pending.expiresAt,
    },
  }, { headers });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "no_autenticado" }, { status: 401, headers });

  let body: { id?: string; resultado?: "aprobada" | "rechazada" };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400, headers });
  }
  if (!body.id || (body.resultado !== "aprobada" && body.resultado !== "rechazada")) {
    return NextResponse.json({ error: "parametros_invalidos" }, { status: 400, headers });
  }

  const updated = await db().update(deviceRequests)
    .set({ status: body.resultado })
    .where(and(
      eq(deviceRequests.id, body.id),
      eq(deviceRequests.clerkUserId, userId),
      eq(deviceRequests.status, "pendiente"),
      sql`${deviceRequests.expiresAt} > now()`,
    ))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: "solicitud_no_vigente" }, { status: 409, headers });
  }
  return NextResponse.json({ ok: true, status: body.resultado }, { headers });
}
