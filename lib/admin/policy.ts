import type { AdminRole } from "./types";

export const ADMIN_PERMISSIONS = [
  "overview.read", "accounts.read", "pii.read", "operations.read", "cases.read", "cases.write",
  "health.read", "audit.read", "reconcile.run", "incidents.write", "export.run", "roles.write", "pause.write",
] as const;
export type AdminPermission = typeof ADMIN_PERMISSIONS[number];

const read = ["overview.read", "accounts.read", "operations.read", "cases.read", "health.read"] as const;
const roles: Record<AdminRole, readonly AdminPermission[]> = {
  owner: ADMIN_PERMISSIONS,
  operations: [...read, "cases.write", "audit.read", "reconcile.run", "incidents.write"],
  support: [...read, "pii.read", "cases.write", "audit.read"],
  auditor: [...read, "audit.read"],
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && Object.hasOwn(roles, value);
}

export function permissionsForRole(value: unknown): AdminPermission[] {
  return isAdminRole(value) ? [...roles[value]] : [];
}

export function roleHasPermission(role: unknown, permission: string): boolean {
  return permissionsForRole(role).some(candidate => candidate === permission);
}

export function mayChangeGrant(actorId: string, targetId: string, role: unknown): boolean {
  return Boolean(actorId && targetId && actorId !== targetId && roleHasPermission(role, "roles.write"));
}
