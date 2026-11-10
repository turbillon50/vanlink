import "server-only";
import { auth } from "@clerk/nextjs/server";
import { adminQuery, assertAdminDatabase } from "./database";
import { isAdminRole, permissionsForRole, roleHasPermission, type AdminPermission } from "./policy";
import type { AdminRole } from "./types";

export class AdminAccessError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export async function assertAdminEnvironment(): Promise<"preview" | "test"> {
  const environment = process.env.ADMIN_ENVIRONMENT;
  if (process.env.ADMIN_ENABLED !== "true" || process.env.VERCEL_ENV === "production" ||
      !["preview", "test"].includes(environment || "") ||
      (environment === "test" && process.env.VERCEL_ENV)) throw new AdminAccessError(503, "admin_environment_unavailable");
  try { await assertAdminDatabase(); }
  catch { throw new AdminAccessError(503, "admin_database_unavailable"); }
  return environment as "preview" | "test";
}

export interface AdminAccess {
  userId: string; role: AdminRole; permissions: AdminPermission[]; environment: "preview" | "test";
}

export async function requireAdmin(permission: AdminPermission, _request?: Request): Promise<AdminAccess> {
  const { userId } = await auth();
  if (!userId) throw new AdminAccessError(401, "admin_authentication_required");
  const environment = await assertAdminEnvironment();
  const result = await adminQuery("SELECT role FROM command_role_grants WHERE clerk_user_id = $1 AND environment = $2 AND revoked_at IS NULL LIMIT 2", [userId, environment]);
  const rows = result.rows;
  const role = rows.length === 1 ? rows[0].role : null;
  if (!isAdminRole(role) || !roleHasPermission(role, permission)) throw new AdminAccessError(403, "admin_access_denied");
  return { userId, role, permissions: permissionsForRole(role), environment };
}

/** A recent second factor is mandatory; absent/unsupported MFA fails closed. */
export async function requireStepUp(): Promise<void> {
  const session = await auth();
  const ages = session.factorVerificationAge;
  // Clerk's multi_factor check falls back to the first factor when the second
  // factor age is -1. Administrative actions require proof of both factors.
  if (!session.userId || !Array.isArray(ages) || ages.length !== 2 ||
      ages.some(age => typeof age !== "number" || !Number.isFinite(age) || age < 0)) {
    throw new AdminAccessError(403, "admin_mfa_required");
  }
  if (!session.userId || !session.has({ reverification: { level: "multi_factor", afterMinutes: 5 } })) {
    throw new AdminAccessError(403, "admin_reverification_required");
  }
}
