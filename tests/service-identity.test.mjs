import test from "node:test";
import assert from "node:assert/strict";
import { Turnkey } from "@turnkey/sdk-server";
import { assertServiceIdentity } from "../lib/wallet/service-identity.ts";

function client(userId = "service", roots = ["owner"], organizationId = "org") {
  return {
    getWhoami: async () => ({ userId, organizationId }),
    getOrganizationConfigs: async () => ({ configs: { quorum: { userIds: roots } } }),
  };
}

test("service identity guard uses methods present in the installed Turnkey SDK", async () => {
  const sdk = new Turnkey({ apiBaseUrl: "https://api.turnkey.com", defaultOrganizationId: "org",
    apiPublicKey: "test", apiPrivateKey: "test" }).apiClient();
  assert.equal(typeof sdk.getWhoami, "function");
  assert.equal(typeof sdk.getOrganizationConfigs, "function");
  await assertServiceIdentity(client(), "org", "service");
});

test("wallet provisioning rejects root credentials and unexpected service identities", async () => {
  await assert.rejects(assertServiceIdentity(client("owner"), "org", "owner"), /Root credentials prohibited/);
  await assert.rejects(assertServiceIdentity(client("other"), "org", "service"), /Service identity mismatch/);
  await assert.rejects(assertServiceIdentity(client("service", ["owner"], "other-org"), "org", "service"), /Service identity mismatch/);
  await assert.rejects(assertServiceIdentity(client(), "org", ""), /Service identity mismatch/);
});

test("unknown or unavailable root quorum never permits provisioning", async () => {
  for (const roots of [[], null, "owner"]) {
    await assert.rejects(assertServiceIdentity(client("service", roots), "org", "service"), /Root quorum unavailable/);
  }
  await assert.rejects(assertServiceIdentity({ ...client(), getOrganizationConfigs: async () => ({ configs: {} }) }, "org", "service"), /Root quorum unavailable/);
  await assert.rejects(assertServiceIdentity({ ...client(), getOrganizationConfigs: async () => { throw new Error("Provider unavailable"); } }, "org", "service"), /Provider unavailable/);
});
