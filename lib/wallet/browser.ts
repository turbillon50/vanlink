"use client";

const OWNER = "vanlink.wallet-device-owner.v1";

export async function clearWalletDevice() {
  const { IndexedDbStamper } = await import("@turnkey/indexed-db-stamper");
  await new IndexedDbStamper().clear();
  localStorage.removeItem(OWNER);
}

export async function prepareWalletDevice(userId: string) {
  const owner = localStorage.getItem(OWNER);
  if (owner && owner !== userId) throw new Error("wallet_device_owner_mismatch");
  const { IndexedDbStamper } = await import("@turnkey/indexed-db-stamper");
  // init() itself creates a key when IndexedDB is empty. Track that event so
  // an existing, unlabelled legacy key is never replaced or adopted blindly.
  const stamper = new (class extends IndexedDbStamper {
    created = false;
    async resetKeyPair(externalKeyPair?: CryptoKeyPair) {
      await super.resetKeyPair(externalKeyPair);
      this.created = true;
    }
  })();
  await stamper.init();
  const currentOwner = localStorage.getItem(OWNER);
  if (currentOwner && currentOwner !== userId) throw new Error("wallet_device_owner_mismatch");
  if (!currentOwner && !stamper.created) throw new Error("wallet_device_legacy_unknown");
  const publicKey = stamper.getPublicKey();
  if (!publicKey) throw new Error("Device key unavailable");
  localStorage.setItem(OWNER, userId);
  return publicKey;
}

/** Load an existing device key without ever creating or replacing one. */
export async function existingWalletDeviceStamper() {
  const { IndexedDbStamper } = await import("@turnkey/indexed-db-stamper");
  const missingKey = new Error("wallet_device_key_missing");
  // Verification must be read-only: the SDK's default init() would otherwise
  // generate a new key when this browser has no stored key.
  const stamper = new (class extends IndexedDbStamper {
    async resetKeyPair() { throw missingKey; }
  })();
  try { await stamper.init(); } catch (error) {
    if (error === missingKey) return null;
    throw error;
  }
  return stamper.getPublicKey() ? stamper : null;
}

/** Public diagnostic fingerprint only; no key material or signatures leave the browser. */
export async function walletDeviceFingerprint(): Promise<string | null> {
  const stamper = await existingWalletDeviceStamper();
  const publicKey = stamper?.getPublicKey();
  if (!publicKey) return null;
  const normalized = publicKey.replace(/^0x/i, "").toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export async function verifyWalletDevice(userId: string, organizationId: string, turnkeyUserId: string) {
  // A local marker may be missing or stale; the stored key's Turnkey identity
  // is the source of truth. Reading it never replaces the existing key.
  const stamper = await existingWalletDeviceStamper();
  if (!stamper) return false;
  const { TurnkeyClient } = await import("@turnkey/http");
  const client = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);
  const identity = await client.getWhoami({ organizationId });
  if (identity.organizationId !== organizationId || identity.userId !== turnkeyUserId) return false;
  // Only the exact verified organization/user may repair a missing or stale
  // marker. Invalid identities, missing keys and API errors leave it untouched.
  // This hint cannot invalidate an identity proven by the existing key.
  try { localStorage.setItem(OWNER, userId); } catch { /* Storage may be unavailable. */ }
  return true;
}

export function walletDeviceOwner() {
  return typeof window === "undefined" ? null : localStorage.getItem(OWNER);
}
