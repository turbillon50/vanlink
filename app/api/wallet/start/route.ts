import { externalMutationGuard } from "@/lib/admin/isolation";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { walletConfig, walletConfigured } from "@/lib/wallet/config";
import { allowedOrigin, validPublicKey } from "@/lib/wallet/security";
import { provisionWallet } from "@/lib/wallet/server";
import { walletDiagnostic } from "@/lib/wallet/diagnostics";
import { primaryEmail } from "@/lib/wallet/recovery-server";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
export async function POST(request: NextRequest) {
  const isolated = externalMutationGuard(request);
  if (isolated) return isolated;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401, headers });
  const expectedUser = request.headers.get("X-VanDeFi-User");
  if (expectedUser && expectedUser !== userId) return NextResponse.json({ error: "La sesión cambió. Revisa tu cuenta." }, { status: 409, headers });
  if (!walletConfigured()) return NextResponse.json({ error: "La activación de wallets está en preparación." }, { status: 503, headers });
  const config = walletConfig();
  if (!allowedOrigin(request.headers.get("origin"), config.origin)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 403, headers });
  try {
    const raw = await request.text();
    if (raw.length > 512) return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 400, headers });
    const { publicKey } = JSON.parse(raw);
    if (!validPublicKey(publicKey)) return NextResponse.json({ error: "No pudimos preparar este dispositivo." }, { status: 400, headers });
    // Recuperación no custodiada: toda wallet nueva debe asociarse al correo
    // de Clerk para permitir agregar un dispositivo si el original se pierde.
    let email: string | null;
    try {
      email = await primaryEmail(userId);
    } catch {
      return NextResponse.json({ error: "No pudimos verificar tu correo. Intenta de nuevo." },
        { status: 503, headers });
    }
    if (!email) {
      return NextResponse.json({ error: "Confirma un correo en tu cuenta para crear y recuperar tu wallet.", code: "email_required" },
        { status: 409, headers });
    }
    await provisionWallet(userId, publicKey, email);
    return NextResponse.json({ connected: true }, { headers });
  } catch (error) {
    console.error("wallet_activation_failed", { stage: "wallet", ...walletDiagnostic(error) });
    return NextResponse.json({ error: "No pudimos activar tu wallet. Intenta de nuevo." }, { status: 503, headers });
  }
}
