import { externalMutationGuard } from "@/lib/admin/isolation";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { walletConfig, walletConfigured } from "@/lib/wallet/config";
import { allowedOrigin } from "@/lib/wallet/security";
import { verifyRecoveryCode, walletFor } from "@/lib/wallet/recovery-server";
import { walletDiagnostic } from "@/lib/wallet/diagnostics";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const HEX_PUB = /^04[0-9a-f]{128}$|^0[23][0-9a-f]{64}$/i;

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
    const raw = await request.text();
    if (raw.length > 1024) return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 400, headers });
    const { otpId, code, targetPublicKey } = JSON.parse(raw);
    if (typeof otpId !== "string" || !/^[A-Za-z0-9]{4,12}$/.test(String(code)) || !HEX_PUB.test(String(targetPublicKey)))
      return NextResponse.json({ error: "Revisa el código." }, { status: 400, headers });
    const wallet = await walletFor(userId);
    if (!wallet) return NextResponse.json({ error: "Aún no tienes wallet activada." }, { status: 404, headers });
    const res = await verifyRecoveryCode(wallet.organizationId, otpId, String(code).trim(), targetPublicKey);
    if (res.userId !== wallet.turnkeyUserId) return NextResponse.json({ error: "Ese código no corresponde a tu wallet." }, { status: 403, headers });
    return NextResponse.json({ credentialBundle: res.credentialBundle, organizationId: wallet.organizationId,
      turnkeyUserId: wallet.turnkeyUserId }, { headers });
  } catch (error) {
    console.error("wallet_recovery_failed", { stage: "verify_code", ...walletDiagnostic(error) });
    return NextResponse.json({ error: "Código incorrecto o vencido. Pide uno nuevo." }, { status: 400, headers });
  }
}
