"use client";

const OWNER = "vanlink.wallet-device-owner.v1";

export async function clearWalletDevice() {
  const { IndexedDbStamper } = await import("@turnkey/indexed-db-stamper");
  await new IndexedDbStamper().clear();
  localStorage.removeItem(OWNER);
}

export async function prepareWalletDevice(userId: string) {
  const { IndexedDbStamper } = await import("@turnkey/indexed-db-stamper");
  const stamper = new IndexedDbStamper();
  await stamper.init();
  // A fresh non-extractable device key is bound to this OAuth nonce.
  await stamper.resetKeyPair();
  localStorage.setItem(OWNER, userId);
  const publicKey = stamper.getPublicKey();
  if (!publicKey) throw new Error("Device key unavailable");
  return publicKey;
}

export async function verifyWalletDevice(userId: string, organizationId: string, turnkeyUserId: string) {
  if (localStorage.getItem(OWNER) !== userId) return false;
  const [{ IndexedDbStamper }, { TurnkeyClient }] = await Promise.all([
    import("@turnkey/indexed-db-stamper"), import("@turnkey/http"),
  ]);
  const stamper = new IndexedDbStamper();
  await stamper.init();
  const client = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);
  const identity = await client.getWhoami({ organizationId });
  return identity.organizationId === organizationId && identity.userId === turnkeyUserId;
}

export function walletDeviceOwner() {
  return localStorage.getItem(OWNER);
}
