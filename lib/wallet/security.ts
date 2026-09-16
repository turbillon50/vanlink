import { createHash, timingSafeEqual } from "node:crypto";

export function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function equalSecret(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length > 256 || b.length > 256) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export function validPublicKey(value: unknown): value is string {
  return typeof value === "string" && /^(02|03)[a-f0-9]{64}$/.test(value);
}

export function allowedOrigin(origin: string | null, canonical: string) {
  return origin === canonical;
}
