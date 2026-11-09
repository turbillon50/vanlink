"use client";
/** Registers this browser using the OTP credential encrypted to this tab. */
import { existingWalletDeviceStamper, prepareWalletDevice } from "@/lib/wallet/browser";

const OWNER = "vanlink.wallet-device-owner.v1";
export type RecoveryStart = { otpId: string; email: string };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "No se pudo completar."), { code: d.code });
  return d as T;
}

async function recoveryDevice(userId: string) {
  const owner = localStorage.getItem(OWNER);
  if (owner && owner !== userId) throw new Error("wallet_device_owner_mismatch");
  const device = await existingWalletDeviceStamper();
  const currentOwner = localStorage.getItem(OWNER);
  if (currentOwner && currentOwner !== userId) throw new Error("wallet_device_owner_mismatch");
  if (!currentOwner && device) throw new Error("wallet_device_legacy_unknown");
  return device;
}

/** Read-only preflight, also used before sending an OTP from the UI. */
export async function assertRecoveryDeviceAvailable(userId: string): Promise<void> {
  await recoveryDevice(userId);
}

async function withDeviceLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("vandefi.wallet.enrollment", { mode: "exclusive" }, operation);
  }
  return operation();
}

export function sendCode() {
  return post<RecoveryStart>("/api/wallet/recover/start", {});
}

export async function recoverWithCode(userId: string, otpId: string, code: string) {
  await assertRecoveryDeviceAvailable(userId);
  const [{ generateP256KeyPair, decryptCredentialBundle, getPublicKey }, { uint8ArrayFromHexString, uint8ArrayToHexString }, { ApiKeyStamper }, { TurnkeyClient }] = await Promise.all([
    import("@turnkey/crypto"), import("@turnkey/encoding"), import("@turnkey/api-key-stamper"), import("@turnkey/http"),
  ]);
  const ephemeral = generateP256KeyPair();
  const res = await post<{ credentialBundle: string; organizationId: string; turnkeyUserId: string }>(
    "/api/wallet/recover/verify", { otpId, code, targetPublicKey: ephemeral.publicKeyUncompressed });

  // Do not hold a browser lock while the user is entering the code. Recheck
  // both marker and key under the same global lock used by auto-enrollment.
  return withDeviceLock(async () => {
    let device = await recoveryDevice(userId);
    if (device) {
      const current = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, device);
      const identity = await current.getWhoami({ organizationId: res.organizationId }).catch(() => null);
      if (identity) {
        if (identity.organizationId !== res.organizationId || identity.userId !== res.turnkeyUserId)
          throw new Error("wallet_device_identity_mismatch");
        const unchanged = await recoveryDevice(userId);
        if (unchanged?.getPublicKey() !== device.getPublicKey()) throw new Error("wallet_device_changed");
        return true; // Already registered: never duplicate an existing API key.
      }
    }

    const sessionPrivate = decryptCredentialBundle(res.credentialBundle, ephemeral.privateKey);
    const sessionPublic = uint8ArrayToHexString(getPublicKey(uint8ArrayFromHexString(sessionPrivate), true));
    const session = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" },
      new ApiKeyStamper({ apiPublicKey: sessionPublic, apiPrivateKey: sessionPrivate }));
    const sessionIdentity = await session.getWhoami({ organizationId: res.organizationId });
    if (sessionIdentity.organizationId !== res.organizationId || sessionIdentity.userId !== res.turnkeyUserId)
      throw new Error("wallet_recovery_identity_mismatch");

    if (!device) {
      // init creates a genuinely missing key once. Claim its local marker
      // before registration so a failed API call can retry this same key.
      await prepareWalletDevice(userId);
      device = await recoveryDevice(userId);
    }
    const devicePublic = device?.getPublicKey();
    if (!devicePublic) throw new Error("wallet_device_key_missing");
    // Even when locks are unavailable, never knowingly replace a key or
    // register one that another account claimed during an asynchronous step.
    const unchanged = await recoveryDevice(userId);
    if (unchanged?.getPublicKey() !== devicePublic) throw new Error("wallet_device_changed");

    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const act = await session.createApiKeys({ type: "ACTIVITY_TYPE_CREATE_API_KEYS_V2", organizationId: res.organizationId,
      timestampMs: String(Date.now()), parameters: { userId: res.turnkeyUserId,
        apiKeys: [{ apiKeyName: `VanLink device ${stamp}`, publicKey: devicePublic, curveType: "API_KEY_CURVE_P256" }] } });
    if (act.activity.status !== "ACTIVITY_STATUS_COMPLETED") throw new Error("wallet_device_registration_unconfirmed");
    return true;
  });
}
