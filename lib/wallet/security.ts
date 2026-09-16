import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function newOAuthChallenge() {
  const verifier = randomBytes(32).toString("base64url");
  return { state: randomBytes(32).toString("base64url"), verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function equalSecret(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length > 256 || b.length > 256) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export function validPublicKey(value: unknown): value is string {
  return typeof value === "string" && /^(02|03)[a-f0-9]{64}$/.test(value);
}

export function assertIdentity(claims: { sub?: string; nonce?: unknown; azp?: unknown; aud?: unknown }, userId: string, publicKey: string, clientId: string) {
  if (claims.sub !== userId || !equalSecret(claims.nonce, digest(publicKey))) throw new Error("Identity mismatch");
  if (claims.azp && claims.azp !== clientId) throw new Error("Authorized party mismatch");
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) throw new Error("Missing authorized party");
}

export function allowedOrigin(origin: string | null, canonical: string) {
  return origin === canonical;
}
