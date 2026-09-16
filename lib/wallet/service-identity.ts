import type { TurnkeyApiClient } from "@turnkey/sdk-server";

type IdentityClient = Pick<TurnkeyApiClient, "getWhoami" | "getOrganizationConfigs">;

export async function assertServiceIdentity(client: IdentityClient, organizationId: string, serviceUserId: string) {
  const identity = await client.getWhoami({ organizationId });
  if (!serviceUserId || identity.userId !== serviceUserId || identity.organizationId !== organizationId) {
    throw new Error("Service identity mismatch");
  }
  const { configs } = await client.getOrganizationConfigs({ organizationId });
  const roots = configs?.quorum?.userIds;
  // Fail closed if the provider cannot establish the organization's root users.
  if (!Array.isArray(roots) || roots.length === 0) throw new Error("Root quorum unavailable");
  if (roots.includes(identity.userId)) throw new Error("Root credentials prohibited");
}
