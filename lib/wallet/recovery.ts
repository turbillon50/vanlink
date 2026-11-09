"use client";
/**
 * lib/wallet/recovery.ts — registra ESTE navegador como dispositivo de la wallet
 * usando la credencial temporal que Turnkey mandó cifrada hacia una llave
 * efímera que solo existe en memoria de esta pestaña.
 */
const OWNER = "vanlink.wallet-device-owner.v1";

export type RecoveryStart = { otpId: string; email: string };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "No se pudo completar."), { code: d.code });
  return d as T;
}

export function sendCode() {
  return post<RecoveryStart>("/api/wallet/recover/start", {});
}

export async function recoverWithCode(userId: string, otpId: string, code: string) {
  // No sobrescribir la clave no extraíble de otra cuenta en este navegador.
  // Una wallet antigua podría no tener todavía recuperación por correo.
  const owner = localStorage.getItem(OWNER);
  if (owner && owner !== userId) throw new Error("wallet_device_owner_mismatch");
  const [{ generateP256KeyPair, decryptCredentialBundle, getPublicKey }, { uint8ArrayFromHexString, uint8ArrayToHexString }, { ApiKeyStamper }, { TurnkeyClient }, { IndexedDbStamper }] = await Promise.all([
    import("@turnkey/crypto"), import("@turnkey/encoding"), import("@turnkey/api-key-stamper"),
    import("@turnkey/http"), import("@turnkey/indexed-db-stamper"),
  ]);
  const ephemeral = generateP256KeyPair();
  const res = await post<{ credentialBundle: string; organizationId: string; turnkeyUserId: string }>(
    "/api/wallet/recover/verify", { otpId, code, targetPublicKey: ephemeral.publicKeyUncompressed });

  const sessionPrivate = decryptCredentialBundle(res.credentialBundle, ephemeral.privateKey);
  const sessionPublic = uint8ArrayToHexString(getPublicKey(uint8ArrayFromHexString(sessionPrivate), true));
  const session = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" },
    new ApiKeyStamper({ apiPublicKey: sessionPublic, apiPrivateKey: sessionPrivate }));

  // Llave nueva de ESTE dispositivo: no extraíble, vive en IndexedDB.
  const device = new IndexedDbStamper();
  await device.init();
  await device.resetKeyPair();
  const devicePublic = device.getPublicKey();
  if (!devicePublic) throw new Error("No se pudo preparar este dispositivo.");

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const act = await session.createApiKeys({ type: "ACTIVITY_TYPE_CREATE_API_KEYS_V2", organizationId: res.organizationId,
    timestampMs: String(Date.now()), parameters: { userId: res.turnkeyUserId,
      apiKeys: [{ apiKeyName: `VanLink device ${stamp}`, publicKey: devicePublic, curveType: "API_KEY_CURVE_P256" }] } });
  if (act.activity.status !== "ACTIVITY_STATUS_COMPLETED") throw new Error("Turnkey no confirmó el nuevo dispositivo.");
  localStorage.setItem(OWNER, userId);
  return true;
}
