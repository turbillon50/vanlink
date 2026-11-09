import { createHash } from "node:crypto";
import { Turnkey } from "@turnkey/sdk-server";
import { currentWallet, noStore, SendError } from "@/lib/send/server";
import { walletConfig } from "@/lib/wallet/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public device fingerprints only, scoped to the authenticated account's wallet. */
export async function GET() {
  try {
    const wallet = await currentWallet();
    const config = walletConfig();
    const client = new Turnkey({
      apiBaseUrl: "https://api.turnkey.com", defaultOrganizationId: config.parentId,
      apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
      apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
    }).apiClient();
    const [{ apiKeys }, { users }] = await Promise.all([
      client.getApiKeys({ organizationId: wallet.organizationId, userId: wallet.turnkeyUserId }),
      client.getUsers({ organizationId: wallet.organizationId }),
    ]);
    const owner = users.find(user => user.userId === wallet.turnkeyUserId);
    if (!owner) throw new SendError("dueno_no_localizado", 502, "No pudimos comprobar al dueño de esta wallet.");
    const registeredDeviceFingerprints = [...new Set(apiKeys
      .filter(key => key.credential.type.endsWith("_P256"))
      .map(key => key.credential.publicKey.replace(/^0x/i, "").toLowerCase())
      .filter(key => /^(?:02|03)[0-9a-f]{64}$/.test(key))
      .map(key => createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16)))];
    return Response.json({
      registeredDeviceFingerprints,
      recoveryEmailPresent: Boolean(owner.userEmail?.trim()),
      checkedAt: new Date().toISOString(),
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof SendError) return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: noStore });
    // Provider errors can contain credentials or request details. Do not log them.
    return Response.json({ error: "consulta_dispositivo_no_disponible", message: "No pudimos comprobar el dispositivo ahora. Tu llave se conserva; intenta nuevamente." }, { status: 503, headers: noStore });
  }
}
