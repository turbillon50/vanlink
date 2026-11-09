import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import ts from "typescript";

const OWNER = "vanlink.wallet-device-owner.v1";
const USER = "user_legacy";
const ORG = "org_legacy";
const TURNKEY_USER = "owner_legacy";
const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/wallet/browser.ts", import.meta.url), "utf8"),
  { fileName: "browser.ts", compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } },
).outputText;

/** Execute the real browser module; only storage and Turnkey IO are mocked. */
function device({ owner = null, key = "legacy-public-key", identity = { organizationId: ORG, userId: TURNKEY_USER }, failure = null, duringWhoami = null } = {}) {
  const values = new Map(owner === null ? [] : [[OWNER, owner]]);
  const state = { key, resets: 0, inits: 0, whoami: 0, requestedKey: null };
  const storage = { getItem: name => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value), removeItem: name => values.delete(name) };
  class IndexedDbStamper {
    publicKey = null;
    async init() {
      state.inits++;
      // Match the installed SDK: init automatically creates missing keys.
      if (state.key) this.publicKey = state.key;
      else await this.resetKeyPair();
    }
    async resetKeyPair() {
      state.resets++;
      state.key = "new-public-key-" + state.resets;
      this.publicKey = state.key;
    }
    getPublicKey() { return this.publicKey; }
    async clear() { state.key = null; }
  }
  class TurnkeyClient {
    constructor(_options, stamper) { state.requestedKey = stamper.getPublicKey(); }
    async getWhoami({ organizationId }) {
      assert.equal(organizationId, ORG);
      state.whoami++;
      if (duringWhoami) duringWhoami(storage);
      if (failure) throw failure;
      return identity;
    }
  }
  const exports = {};
  const context = vm.createContext({ exports, localStorage: storage, window: {}, crypto: webcrypto, TextEncoder,
    require(name) {
      if (name === "@turnkey/indexed-db-stamper") return { IndexedDbStamper };
      if (name === "@turnkey/http") return { TurnkeyClient };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  vm.runInContext(compiled, context, { filename: "browser.ts" });
  return { api: exports, state, storage };
}

const verify = d => d.api.verifyWalletDevice(USER, ORG, TURNKEY_USER);

test("legacy key without local marker is claimed only after exact Turnkey ownership", async () => {
  const d = device();
  assert.equal(await verify(d), true);
  assert.equal(d.storage.getItem(OWNER), USER);
  assert.equal(d.state.requestedKey, "legacy-public-key");
  assert.equal(d.state.whoami, 1);
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.key, "legacy-public-key");
});

test("legacy key for another Turnkey user is neither reset nor claimed", async () => {
  const d = device({ identity: { organizationId: ORG, userId: "other_owner" } });
  assert.equal(await verify(d), false);
  assert.equal(d.storage.getItem(OWNER), null);
  assert.equal(d.state.key, "legacy-public-key");
  assert.equal(d.state.resets, 0);
});

test("legacy key for another organization is not claimed", async () => {
  const d = device({ identity: { organizationId: "another_org", userId: TURNKEY_USER } });
  assert.equal(await verify(d), false);
  assert.equal(d.storage.getItem(OWNER), null);
  assert.equal(d.state.resets, 0);
});

test("network failure preserves an unlabelled legacy key and marker", async () => {
  const d = device({ failure: new Error("network unavailable") });
  await assert.rejects(verify(d), /network unavailable/);
  assert.equal(d.storage.getItem(OWNER), null);
  assert.equal(d.state.key, "legacy-public-key");
  assert.equal(d.state.resets, 0);
});

test("exact Turnkey identity repairs a stale foreign marker without replacing the key", async () => {
  const d = device({ owner: "user_other" });
  assert.equal(await verify(d), true);
  assert.equal(d.storage.getItem(OWNER), USER);
  assert.equal(d.state.key, "legacy-public-key");
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.inits, 1);
  assert.equal(d.state.whoami, 1);
});

test("a foreign marker survives when the stored key belongs to another Turnkey owner", async () => {
  const d = device({ owner: "user_other", identity: { organizationId: ORG, userId: "other_owner" } });
  assert.equal(await verify(d), false);
  assert.equal(d.storage.getItem(OWNER), "user_other");
  assert.equal(d.state.key, "legacy-public-key");
  assert.equal(d.state.resets, 0);
});

test("network errors preserve a foreign marker and its key", async () => {
  const d = device({ owner: "user_other", failure: new Error("network unavailable") });
  await assert.rejects(verify(d), /network unavailable/);
  assert.equal(d.storage.getItem(OWNER), "user_other");
  assert.equal(d.state.key, "legacy-public-key");
  assert.equal(d.state.resets, 0);
});

test("a missing device key does not clear or repair a foreign marker", async () => {
  const d = device({ owner: "user_other", key: null });
  assert.equal(await verify(d), false);
  assert.equal(d.storage.getItem(OWNER), "user_other");
  assert.equal(d.state.key, null);
  assert.equal(d.state.resets, 0);
});

test("missing key verification does not let SDK init create a key", async () => {
  const d = device({ key: null });
  assert.equal(await verify(d), false);
  assert.equal(d.state.key, null);
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.whoami, 0);
  assert.equal(d.storage.getItem(OWNER), null);
});

test("preparing an unknown existing legacy key preserves it and asks for verification", async () => {
  const d = device();
  await assert.rejects(d.api.prepareWalletDevice(USER), /wallet_device_legacy_unknown/);
  assert.equal(d.state.key, "legacy-public-key");
  assert.equal(d.state.resets, 0);
  assert.equal(d.storage.getItem(OWNER), null);
});

test("preparing another account never replaces or adopts its key", async () => {
  const d = device({ owner: "user_other" });
  await assert.rejects(d.api.prepareWalletDevice(USER), /wallet_device_owner_mismatch/);
  assert.equal(d.state.key, "legacy-public-key");
  assert.equal(d.state.inits, 0);
  assert.equal(d.state.resets, 0);
  assert.equal(d.storage.getItem(OWNER), "user_other");
});

test("a genuinely new browser creates one key and retries keep that same key", async () => {
  const d = device({ key: null });
  const first = await d.api.prepareWalletDevice(USER);
  assert.equal(first, "new-public-key-1");
  assert.equal(d.state.resets, 1);
  assert.equal(d.storage.getItem(OWNER), USER);
  assert.equal(await d.api.prepareWalletDevice(USER), first);
  assert.equal(d.state.resets, 1);
});

test("verified legacy ownership permits retries without generating a replacement key", async () => {
  const d = device();
  assert.equal(await verify(d), true);
  assert.equal(await d.api.prepareWalletDevice(USER), "legacy-public-key");
  assert.equal(d.state.resets, 0);
});

test("authenticated key identity takes precedence over a marker changed during the request", async () => {
  const d = device({ duringWhoami: storage => storage.setItem(OWNER, "user_other") });
  assert.equal(await verify(d), true);
  assert.equal(d.storage.getItem(OWNER), USER);
  assert.equal(d.state.key, "legacy-public-key");
  assert.equal(d.state.resets, 0);
});

test("readonly stamper returns null without generating a missing key", async () => {
  const d = device({ key: null });
  assert.equal(await d.api.existingWalletDeviceStamper(), null);
  assert.equal(d.state.key, null);
  assert.equal(d.state.resets, 0);
  assert.equal(d.storage.getItem(OWNER), null);
});

test("device fingerprint matches normalized public key hash without claiming or changing it", async () => {
  const key = "0x02AbCdEf";
  const d = device({ key });
  const expected = createHash("sha256").update("02abcdef").digest("hex").slice(0, 16);
  assert.equal(await d.api.walletDeviceFingerprint(), expected);
  assert.equal(d.state.key, key);
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.whoami, 0);
  assert.equal(d.storage.getItem(OWNER), null);
});

test("device fingerprint is null when no key exists and never generates one", async () => {
  const d = device({ key: null });
  assert.equal(await d.api.walletDeviceFingerprint(), null);
  assert.equal(d.state.key, null);
  assert.equal(d.state.resets, 0);
});

test("verified identity remains valid when saving the local marker is blocked", async () => {
  const d = device();
  d.storage.setItem = () => { throw new Error("SecurityError: storage blocked"); };
  assert.equal(await verify(d), true);
  assert.equal(d.storage.getItem(OWNER), null);
  assert.equal(d.state.key, "legacy-public-key");
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.whoami, 1);
});
