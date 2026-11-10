import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const browser = compile("../lib/wallet/recovery-contact.ts");
const server = compile("../lib/wallet/recovery-server.ts");
const confirmed = { userId: "test-login", organizationId: "test-org", turnkeyUserId: "test-owner", email: "owner@example.test" };
function fixture(options = {}) {
  const calls = [];
  const exports = {};
  const client = class {
    async getWhoami() {
      return { organizationId: confirmed.organizationId, userId: options.foreign ? "different" : confirmed.turnkeyUserId };
    }
    async updateUserEmail(request) { calls.push(request); return { activity: { status: options.pending ? "PENDING" : "ACTIVITY_STATUS_COMPLETED" } }; }
    async getUsers() { return { users: [{ userId: confirmed.turnkeyUserId, userEmail: calls.length ? (options.missing ? null : confirmed.email) : (options.alreadySet ? confirmed.email : null) }] }; }
  };
  vm.runInNewContext(browser, { exports, Date,
    fetch: async () => ({ ok: true, json: async () => ({ ...confirmed, ...options.changed }) }),
    require: path => path === "./browser" ? { existingWalletDeviceStamper: async () => options.noKey ? null : {} } : { TurnkeyClient: client },
  });
  return { calls, run: () => exports.attachRecoveryContact(confirmed) };
}
for (const options of [{ noKey: true }, { alreadySet: true }, { foreign: true }, { changed: { email: "changed@example.test" } },
  { changed: { userId: "other-login" } }]) {
  test("changed account, contact or missing authority blocks contact enrollment " + JSON.stringify(options), async () => {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.equal(f.calls.length, 0);
  });
}
test("contact enrollment requires completed activity and independent user readback", async () => {
  for (const options of [{ pending: true }, { missing: true }]) await assert.rejects(fixture(options).run(), /unconfirmed/);
  const f = fixture(); await f.run();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].type, "ACTIVITY_TYPE_UPDATE_USER_EMAIL");
  assert.equal(f.calls[0].organizationId, confirmed.organizationId);
  assert.equal(f.calls[0].parameters.userId, confirmed.turnkeyUserId);
});
test("Clerk recovery contact must be verified on the primary address", async () => {
  for (const status of ["unverified", "verified"]) {
    const exports = {};
    const users = { getUser: async () => ({ primaryEmailAddress: { emailAddress: "Me@Example.test", verification: { status } } }) };
    vm.runInNewContext(server, { exports, require: path => path.includes("@clerk") ? { clerkClient: async () => ({ users }) } : {} });
    assert.equal(await exports.primaryEmail("test"), status === "verified" ? "me@example.test" : null);
  }
});
