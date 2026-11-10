import { externalMutationGuard } from "@/lib/admin/isolation";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { walletConfig, walletConfigured } from "@/lib/wallet/config";
import { allowedOrigin } from "@/lib/wallet/security";
import { ownerEmail, primaryEmail, sendRecoveryCode, walletFor } from "@/lib/wallet/recovery-server";
import { walletDiagnostic } from "@/lib/wallet/diagnostics";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

function oculto(email: string) {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(u.length - 2, 1))}@${d}`;
}

export async function POST(request: NextRequest) {
  const isolated = externalMutationGuard(request);
  if (isolated) return isolated;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401, headers });
  const expectedUser = request.headers.get("X-VanDeFi-User");
  if (expectedUser && expectedUser !== userId) return NextResponse.json({ error: "La sesión cambió. Revisa tu cuenta." }, { status: 409, headers });
  if (!walletConfigured()) return NextResponse.json({ error: "La recuperación no está disponible ahora." }, { status: 503, headers });
  if (!allowedOrigin(request.headers.get("origin"), walletConfig().origin)) return NextResponse.json({ error: "Solicitud no válida." }, { status: 403, headers });
  try {
    const wallet = await walletFor(userId);
    if (!wallet) return NextResponse.json({ error: "Aún no tienes wallet activada." }, { status: 404, headers });
    const registered = await ownerEmail(wallet.organizationId, wallet.turnkeyUserId);
    if (!registered) return NextResponse.json({ code: "sin_correo",
      error: "Esta wallet se creó antes de la recuperación por correo y solo se puede mover desde el dispositivo original." }, { status: 409, headers });
    const email = await primaryEmail(userId);
    if (!email || email !== registered) return NextResponse.json({ code: "correo_distinto",
      error: "El correo de tu cuenta no coincide con el de tu wallet." }, { status: 409, headers });
    const otpId = await sendRecoveryCode(wallet.organizationId, registered);
    return NextResponse.json({ otpId, email: oculto(registered) }, { headers });
  } catch (error) {
    console.error("wallet_recovery_failed", { stage: "send_code", ...walletDiagnostic(error) });
    return NextResponse.json({ error: "No pudimos mandar el código. Intenta de nuevo." }, { status: 503, headers });
  }
}
