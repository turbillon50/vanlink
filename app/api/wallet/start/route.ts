import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { walletConfig, walletConfigured } from "@/lib/wallet/config";
import { allowedOrigin, validPublicKey } from "@/lib/wallet/security";
import { provisionWallet } from "@/lib/wallet/server";
import { walletDiagnostic } from "@/lib/wallet/diagnostics";

export const runtime = "nodejs";
export const maxDuration = 60;
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
    await provisionWallet(userId, publicKey);
    return NextResponse.json({ connected: true }, { headers });
  } catch (error) {
    console.error("wallet_activation_failed", { stage: "wallet", ...walletDiagnostic(error) });
    return NextResponse.json({ error: "No pudimos activar tu wallet. Intenta de nuevo." }, { status: 503, headers });
  }
}
