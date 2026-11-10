"use client";
import { existingWalletDeviceStamper } from "./browser";

export type RecoveryContact = { userId: string; organizationId: string; turnkeyUserId: string; email: string };

export async function readRecoveryContact() {
  const response = await fetch("/api/wallet/recovery-contact", { cache: "no-store" });
  if (!response.ok) throw new Error("wallet_contact_unavailable");
  return await response.json() as RecoveryContact;
}

/** Explicit owner action. No credential is generated, and the backend cannot stamp it. */
export async function attachRecoveryContact(confirmed: RecoveryContact) {
  const current = await readRecoveryContact();
  if (current.userId !== confirmed.userId || current.organizationId !== confirmed.organizationId ||
      current.turnkeyUserId !== confirmed.turnkeyUserId || current.email !== confirmed.email) {
    throw new Error("wallet_contact_changed");
  }
  const stamper = await existingWalletDeviceStamper();
  if (!stamper) throw new Error("wallet_device_key_missing");
  const { TurnkeyClient } = await import("@turnkey/http");
  const client = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);
  const identity = await client.getWhoami({ organizationId: current.organizationId });
  if (identity.organizationId !== current.organizationId || identity.userId !== current.turnkeyUserId) {
    throw new Error("wallet_device_identity_mismatch");
  }
  const before = await client.getUsers({ organizationId: current.organizationId });
  const prior = before.users.find(user => user.userId === current.turnkeyUserId);
  if (!prior || prior.userEmail?.trim()) throw new Error("wallet_contact_changed");
  const { activity } = await client.updateUserEmail({ type: "ACTIVITY_TYPE_UPDATE_USER_EMAIL",
    organizationId: current.organizationId, timestampMs: String(Date.now()),
    parameters: { userId: current.turnkeyUserId, userEmail: current.email } });
  if (activity.status !== "ACTIVITY_STATUS_COMPLETED") throw new Error("wallet_contact_unconfirmed");
  const { users } = await client.getUsers({ organizationId: current.organizationId });
  const owner = users.find(user => user.userId === current.turnkeyUserId);
  if (owner?.userEmail?.toLowerCase() !== current.email) throw new Error("wallet_contact_unconfirmed");
}
