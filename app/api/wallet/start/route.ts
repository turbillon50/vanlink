import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { walletFlows } from "@/lib/db/schema";
import { walletConfig, walletConfigured } from "@/lib/wallet/config";
import { allowedOrigin, digest, newOAuthChallenge, validPublicKey } from "@/lib/wallet/security";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401, headers });
  if (!walletConfigured()) return NextResponse.json({ error: "La activación de wallets está en preparación." }, { status: 503, headers });
  const config = walletConfig();
  if (!allowedOrigin(request.headers.get("origin"), config.origin)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 403, headers });
  try {
    const raw = await request.text();
    if (raw.length > 512) return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 400, headers });
    const { publicKey } = JSON.parse(raw);
    if (!validPublicKey(publicKey)) return NextResponse.json({ error: "No pudimos preparar este dispositivo." }, { status: 400, headers });
    const { state, verifier, challenge } = newOAuthChallenge();
    const values = { clerkUserId: userId, stateHash: digest(state), publicKey, verifier,
      expiresAt: new Date(Date.now() + 5 * 60_000), createdAt: new Date() };
    const started = await db().insert(walletFlows).values(values).onConflictDoUpdate({ target: walletFlows.clerkUserId,
      set: values, setWhere: sql`${walletFlows.createdAt} < now() - interval '15 seconds'` }).returning();
    if (!started.length) return NextResponse.json({ error: "Espera unos segundos e intenta de nuevo." }, { status: 429, headers });
    const url = new URL(`${config.issuer}/oauth/authorize`);
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
      response_type: "code", scope: "openid profile email", state, nonce: digest(publicKey),
      code_challenge: challenge, code_challenge_method: "S256" }).toString();
    const response = NextResponse.json({ url: url.toString() }, { headers });
    response.cookies.set("__Host-vanlink-wallet", state, { secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
    return response;
  } catch {
    return NextResponse.json({ error: "No pudimos iniciar la conexión. Intenta de nuevo." }, { status: 503, headers });
  }
}
