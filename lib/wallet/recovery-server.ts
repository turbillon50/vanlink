import "server-only";
import { Turnkey } from "@turnkey/sdk-server";
import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { walletConfig } from "./config";

/**
 * Recuperación de dispositivo por correo (no custodial).
 * El servidor solo pide a Turnkey que mande un código al correo del dueño y
 * entrega a Turnkey el código que el usuario escribió. Turnkey cifra la
 * credencial temporal hacia una llave que vive SOLO en el navegador del usuario:
 * el servidor nunca puede usarla. Con esa credencial el navegador registra su
 * nueva llave de dispositivo como dueña de la wallet.
 */
function client() {
  const config = walletConfig();
  return new Turnkey({ apiBaseUrl: "https://api.turnkey.com", defaultOrganizationId: config.parentId,
    apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!, apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY! }).apiClient();
}

export async function primaryEmail(userId: string) {
  const user = await (await clerkClient()).users.getUser(userId);
  const primary = user.primaryEmailAddress;
  return primary?.verification?.status === "verified" ? primary.emailAddress.trim().toLowerCase() : null;
}

export async function walletFor(userId: string) {
  return (await db().select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0] ?? null;
}

/** Correo registrado en Turnkey para el dueño de la wallet (o null si la wallet es anterior a la recuperación). */
export async function ownerEmail(organizationId: string, turnkeyUserId: string) {
  const { users } = await client().getUsers({ organizationId });
  const owner = users.find(u => u.userId === turnkeyUserId);
  return owner?.userEmail?.toLowerCase() ?? null;
}

export async function sendRecoveryCode(organizationId: string, email: string) {
  const res = await client().initOtpAuth({ organizationId, otpType: "OTP_TYPE_EMAIL", contact: email,
    appName: "VanDeFi", otpLength: 6, expirationSeconds: "600" });
  return res.otpId;
}

export async function verifyRecoveryCode(organizationId: string, otpId: string, otpCode: string, targetPublicKey: string) {
  const res = await client().otpAuth({ organizationId, otpId, otpCode, targetPublicKey,
    apiKeyName: `recuperacion-${Date.now()}`, expirationSeconds: "900", invalidateExisting: false });
  if (!res.credentialBundle) throw new Error("Sin credencial");
  return { credentialBundle: res.credentialBundle, userId: res.userId };
}
