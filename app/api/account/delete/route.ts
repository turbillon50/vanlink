/**
 * app/api/account/delete/route.ts
 * Eliminación de cuenta (requisito de Google Play y App Store).
 *
 * Borra el vínculo de la cuenta con la wallet y la actividad fiat asociada.
 * NO toca la sub-organización de Turnkey: las llaves son del usuario y sus
 * fondos siguen en la blockchain. Por eso la pantalla exige retirar antes.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets, walletFlows } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "no_autenticado" }, { status: 401, headers });
  }

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400, headers });
  }
  if (body.confirm !== "ELIMINAR") {
    return NextResponse.json({ error: "confirmacion_requerida" }, { status: 400, headers });
  }

  try {
    if (process.env.DATABASE_URL) {
      await db().delete(walletFlows).where(eq(walletFlows.clerkUserId, userId));
      await db().delete(wallets).where(eq(wallets.clerkUserId, userId));
      // La actividad fiat se anonimiza en vez de borrarse: puede ser necesaria
      // para obligaciones contables, pero deja de estar ligada a la persona.
      await db().execute(
        sql`UPDATE fiat_activity SET user_id = NULL WHERE user_id = ${userId}`,
      );
    }

    const client = await clerkClient();
    await client.users.deleteUser(userId);

    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("[account/delete] fallo:", error);
    return NextResponse.json({ error: "fallo_al_eliminar" }, { status: 500, headers });
  }
}
