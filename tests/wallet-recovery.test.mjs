import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const OWNER = "vanlink.wallet-device-owner.v1";
const USER = "user_recovery";
const ORG = "org_recovery";
const TURNKEY_USER = "owner_recovery";
const identity = { organizationId: ORG, userId: TURNKEY_USER };
const compiled = Object.fromEntries(["browser", "recovery"].map(name => [name, ts.transpileModule(
  readFileSync(new URL(`../lib/wallet/${name}.ts`, import.meta.url), "utf8"),
  { fileName: name + ".ts", compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } },
).outputText]));

/** Real browser/recovery modules, with browser storage and remote IO isolated. */
function recovery(options = {}) {
  const { owner = null, key = null, registered = false, deviceIdentity = identity,
    sessionIdentity = identity, registrationFailures = 0, registrationStatus = "ACTIVITY_STATUS_COMPLETED",
    verifyFailure = false, duringVerify = null, duringDeviceCheck = null } = options;
  const values = new Map(owner === null ? [] : [[OWNER, owner]]);
  const state = { key, registered, resets: 0, registrations: 0, verifyCalls: 0, startCalls: 0,
    deviceChecks: 0, sessionChecks: 0, locks: 0, locked: false, registrationKeys: [],
    remainingFailures: registrationFailures, readsInsideLock: 0 };
  const storage = { getItem: name => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value), removeItem: name => values.delete(name) };
  class IndexedDbStamper {
    publicKey = null;
    async init() {
      if (state.locked) state.readsInsideLock++;
      if (state.key) this.publicKey = state.key;
      else await this.resetKeyPair();
    }
    async resetKeyPair() {
      state.resets++;
      state.key = "new-device-key-" + state.resets;
      this.publicKey = state.key;
    }
    getPublicKey() { return this.publicKey; }
    async clear() { state.key = null; }
  }
  class ApiKeyStamper { isSession = true; }
  class TurnkeyClient {
    constructor(_options, stamper) { this.session = stamper instanceof ApiKeyStamper; }
    async getWhoami({ organizationId }) {
      assert.equal(organizationId, ORG);
      if (this.session) { state.sessionChecks++; return sessionIdentity; }
      state.deviceChecks++;
      if (duringDeviceCheck) duringDeviceCheck(state, storage);
      if (!state.registered) throw new Error("device credential not registered");
      return deviceIdentity;
    }
    async createApiKeys(request) {
      assert.equal(this.session, true);
      assert.equal(state.locked, true);
      assert.equal(request.organizationId, ORG);
      assert.equal(request.parameters.userId, TURNKEY_USER);
      assert.equal(storage.getItem(OWNER), USER, "claim must precede remote registration for retry safety");
      state.registrations++;
      state.registrationKeys.push(request.parameters.apiKeys[0].publicKey);
      if (state.remainingFailures-- > 0) throw new Error("registration unavailable");
      if (registrationStatus === "ACTIVITY_STATUS_COMPLETED") state.registered = true;
      return { activity: { status: registrationStatus } };
    }
  }
  const cache = {};
  let context;
  const req = name => {
    if (name === "@/lib/wallet/browser") return load("browser");
    if (name === "@turnkey/indexed-db-stamper") return { IndexedDbStamper };
    if (name === "@turnkey/http") return { TurnkeyClient };
    if (name === "@turnkey/api-key-stamper") return { ApiKeyStamper };
    if (name === "@turnkey/crypto") return {
      generateP256KeyPair: () => ({ publicKeyUncompressed: "test-ephemeral-public", privateKey: "test-ephemeral-private" }),
      decryptCredentialBundle: () => "test-session-private", getPublicKey: () => new Uint8Array([1]),
    };
    if (name === "@turnkey/encoding") return {
      uint8ArrayFromHexString: () => new Uint8Array([1]), uint8ArrayToHexString: () => "test-session-public",
    };
    throw new Error("Unexpected dependency: " + name);
  };
  context = vm.createContext({ localStorage: storage, window: {}, require: req,
    navigator: { locks: { async request(name, lockOptions, operation) {
      assert.equal(name, "vandefi.wallet.enrollment");
      assert.equal(lockOptions.mode, "exclusive");
      state.locks++; state.locked = true;
      try { return await operation(); } finally { state.locked = false; }
    } } },
    async fetch(url) {
      if (url.endsWith("/recover/start")) {
        state.startCalls++;
        return { ok: true, json: async () => ({ otpId: "test-id", email: "masked@example.invalid" }) };
      }
      assert.equal(url, "/api/wallet/recover/verify");
      state.verifyCalls++;
      if (duringVerify) duringVerify(state, storage);
      return { ok: !verifyFailure, json: async () => verifyFailure
        ? { error: "Código incorrecto o vencido." }
        : { clerkUserId: options.responseClerkUser ?? USER, credentialBundle: "test-encrypted-bundle", ...identity, turnkeyUserId: TURNKEY_USER } };
    },
  });
  function load(name) {
    if (cache[name]) return cache[name];
    const exports = {};
    const factory = vm.runInContext("(function(exports, require) {" + compiled[name] + "\n})", context);
    factory(exports, req);
    return cache[name] = exports;
  }
  return { api: load("recovery"), state, storage };
}

const recover = d => d.api.recoverWithCode(USER, "test-id", "000000");

test("unknown legacy key preflight blocks before sending a code and preserves the key", async () => {
  const d = recovery({ key: "legacy-device-key" });
  await assert.rejects(d.api.assertRecoveryDeviceAvailable(USER), /wallet_device_legacy_unknown/);
  assert.equal(d.state.startCalls, 0);
  assert.equal(d.state.verifyCalls, 0);
  assert.equal(d.state.key, "legacy-device-key");
  assert.equal(d.state.resets, 0);
});

test("unknown legacy key recovery cannot exchange OTP or overwrite the key", async () => {
  const d = recovery({ key: "legacy-device-key" });
  await assert.rejects(recover(d), /wallet_device_legacy_unknown/);
  assert.equal(d.state.verifyCalls, 0);
  assert.equal(d.state.registrations, 0);
  assert.equal(d.state.key, "legacy-device-key");
  assert.equal(d.state.resets, 0);
});

test("another account marker blocks recovery before any OTP exchange", async () => {
  const d = recovery({ owner: "user_other", key: "other-device-key" });
  await assert.rejects(recover(d), /wallet_device_owner_mismatch/);
  assert.equal(d.state.verifyCalls, 0);
  assert.equal(d.state.registrations, 0);
  assert.equal(d.state.key, "other-device-key");
  assert.equal(d.state.resets, 0);
});

test("new device creates one key after verified OTP under the shared enrollment lock", async () => {
  const d = recovery();
  assert.equal(await recover(d), true);
  assert.equal(d.state.resets, 1);
  assert.equal(d.state.key, "new-device-key-1");
  assert.deepEqual(d.state.registrationKeys, ["new-device-key-1"]);
  assert.equal(d.storage.getItem(OWNER), USER);
  assert.equal(d.state.locks, 1);
  assert(d.state.readsInsideLock > 0);
});

test("failed registration retries the same key instead of generating another one", async () => {
  const d = recovery({ registrationFailures: 1 });
  await assert.rejects(recover(d), /registration unavailable/);
  assert.equal(d.state.resets, 1);
  assert.equal(d.storage.getItem(OWNER), USER);
  assert.equal(await recover(d), true);
  assert.equal(d.state.resets, 1);
  assert.deepEqual(d.state.registrationKeys, ["new-device-key-1", "new-device-key-1"]);
});

test("same-account registered key returns success without duplicate API-key registration", async () => {
  const d = recovery({ owner: USER, key: "registered-key", registered: true });
  assert.equal(await recover(d), true);
  assert.equal(d.state.deviceChecks, 1);
  assert.equal(d.state.sessionChecks, 0);
  assert.equal(d.state.registrations, 0);
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.key, "registered-key");
});

test("same-account unregistered key is reused for registration without reset", async () => {
  const d = recovery({ owner: USER, key: "pending-device-key" });
  assert.equal(await recover(d), true);
  assert.equal(d.state.resets, 0);
  assert.deepEqual(d.state.registrationKeys, ["pending-device-key"]);
});

test("unconfirmed registration preserves the newly created key and retry marker", async () => {
  const d = recovery({ registrationStatus: "ACTIVITY_STATUS_PENDING" });
  await assert.rejects(recover(d), /wallet_device_registration_unconfirmed/);
  assert.equal(d.state.resets, 1);
  assert.equal(d.state.key, "new-device-key-1");
  assert.equal(d.storage.getItem(OWNER), USER);
});

test("invalid OTP creates no device key and acquires no mutation lock", async () => {
  const d = recovery({ verifyFailure: true });
  await assert.rejects(recover(d), /Código incorrecto/);
  assert.equal(d.state.key, null);
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.locks, 0);
  assert.equal(d.state.registrations, 0);
});

test("mismatched OTP-session identity cannot create or register a key", async () => {
  const d = recovery({ sessionIdentity: { organizationId: ORG, userId: "other_owner" } });
  await assert.rejects(recover(d), /wallet_recovery_identity_mismatch/);
  assert.equal(d.state.key, null);
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.registrations, 0);
});

test("foreign key inserted during OTP exchange is rechecked inside the lock", async () => {
  const d = recovery({ duringVerify(state, storage) {
    state.key = "another-tab-key"; storage.setItem(OWNER, "user_other");
  } });
  await assert.rejects(recover(d), /wallet_device_owner_mismatch/);
  assert.equal(d.state.key, "another-tab-key");
  assert.equal(d.storage.getItem(OWNER), "user_other");
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.registrations, 0);
  assert.equal(d.state.locks, 1);
});

test("unlabelled key inserted during OTP exchange is preserved rather than adopted", async () => {
  const d = recovery({ duringVerify(state) { state.key = "unknown-tab-key"; } });
  await assert.rejects(recover(d), /wallet_device_legacy_unknown/);
  assert.equal(d.state.key, "unknown-tab-key");
  assert.equal(d.storage.getItem(OWNER), null);
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.registrations, 0);
});

test("successful device lookup for another identity never re-registers that key", async () => {
  const d = recovery({ owner: USER, key: "other-identity-key", registered: true,
    deviceIdentity: { organizationId: ORG, userId: "other_owner" } });
  await assert.rejects(recover(d), /wallet_device_identity_mismatch/);
  assert.equal(d.state.key, "other-identity-key");
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.registrations, 0);
});

test("key replacement during successful identity lookup cannot be reported as ready", async () => {
  const d = recovery({ owner: USER, key: "registered-key", registered: true,
    duringDeviceCheck(state) { state.key = "changed-device-key"; } });
  await assert.rejects(recover(d), /wallet_device_changed/);
  assert.equal(d.state.key, "changed-device-key");
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.registrations, 0);
});

test("completed key registration cannot authorize a different Turnkey user", async () => {
  const d = recovery({ deviceIdentity: { organizationId: ORG, userId: "another-user" } });
  await assert.rejects(recover(d), /wallet_device_identity_mismatch/);
  assert.equal(d.state.registrations, 1);
});

test("switching Clerk accounts while a recovery is open cannot bind a credential", async () => {
  const d = recovery({ responseClerkUser: "other-login" });
  await assert.rejects(recover(d), /wallet_recovery_account_changed/);
  assert.equal(d.state.resets, 0);
  assert.equal(d.state.registrations, 0);
});
