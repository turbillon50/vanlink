import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const sources = Object.fromEntries([
  ["config", "../lib/wallet/config.ts"],
  ["server", "../lib/wallet/server.ts"],
  ["start", "../app/api/wallet/start/route.ts"],
  ["wallet", "../app/api/wallet/route.ts"],
].map(([name, path]) => [name, ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText]));

const userId = "user_provision_pause";
const key = "02" + "ab".repeat(32);
const existing = { clerkUserId: userId, organizationId: "owned-org", walletId: "owned-wallet",
  turnkeyUserId: "owned-owner", evmAddress: "0x" + "11".repeat(20), bitcoinAddress: "bc1-existing" };
const activeEnv = { WALLET_ACTIVATION_ENABLED: "true", TURNKEY_SERVICE_USER_ID: "service",
  TURNKEY_ORGANIZATION_ID: "parent", TURNKEY_API_PUBLIC_KEY: "test-public", TURNKEY_API_PRIVATE_KEY: "test-private",
  DATABASE_URL: "postgresql://example.invalid/test", APP_ORIGIN: "https://example.test" };

function load(name, imports, env = {}) {
  const exports = {};
  vm.runInNewContext(sources[name], {
    exports, Response, URL, process: { env }, console: { error() {} },
    require: path => { assert.ok(Object.hasOwn(imports, path), "Unexpected import: " + path); return imports[path]; },
  }, { timeout: 5000 });
  return exports;
}

function config(env = activeEnv) { return load("config", { "server-only": {} }, env); }

function rows(result) {
  return { then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }, limit() { return this; } };
}

function server(options = {}) {
  const calls = [];
  const env = { ...activeEnv, ...(options.env || {}) };
  const current = options.existing || null;
  const select = () => ({ from: () => ({ where: () => { calls.push("lookup"); return rows(current ? [current] : []); } }) });
  const tx = {
    execute: async () => { calls.push("lock"); }, select,
    insert: () => ({ values: values => ({ returning: async () => { calls.push("save"); return [{ ...values }]; } }) }),
  };
  const db = () => ({ select, transaction: operation => operation(tx) });
  const client = {
    getSubOrgIds: async () => { calls.push("suborg-lookup"); return { organizationIds: options.matches || [] }; },
    createSubOrganization: async () => { calls.push("create"); return { subOrganizationId: "new-org" }; },
    getWallets: async () => { calls.push("read-wallets"); return { wallets: [{ walletId: "new-wallet" }] }; },
    getWalletAccounts: async () => ({ accounts: [
      { addressFormat: "ADDRESS_FORMAT_ETHEREUM", address: "0x" + "22".repeat(20) },
      { addressFormat: "ADDRESS_FORMAT_BITCOIN_MAINNET_P2WPKH", address: "bc1-new" },
    ] }),
    getUsers: async () => ({ users: [{ userId: "new-owner" }] }),
  };
  const exports = load("server", {
    "server-only": {},
    "@turnkey/sdk-server": { Turnkey: class { constructor() { calls.push("sdk"); } apiClient() { return client; } },
      DEFAULT_ETHEREUM_ACCOUNTS: [], DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS: [] },
    "drizzle-orm": { eq: (...args) => args, sql: (...args) => args },
    "@/lib/db": { db }, "@/lib/db/schema": { wallets: { clerkUserId: "clerk_user_id" } },
    "./config": config(env),
    "./service-identity": { assertServiceIdentity: async () => { calls.push("identity"); } },
    "./diagnostics": { walletStep: async (_step, operation) => operation() },
  }, env);
  return { ...exports, calls };
}

function start(options = {}) {
  const calls = [];
  const env = { ...activeEnv, ...(options.env || {}) };
  class WalletProvisioningPausedError extends Error {
    constructor() { super("Wallet provisioning paused"); this.code = "wallet_provisioning_paused"; }
  }
  const exports = load("start", {
    "@clerk/nextjs/server": { auth: async () => ({ userId: options.unauthorized ? null : userId }) },
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/wallet/config": config(env),
    "@/lib/wallet/security": {
      allowedOrigin: (origin, allowed) => origin === allowed,
      validPublicKey: value => typeof value === "string" && /^(02|03)[0-9a-f]{64}$/.test(value),
    },
    "@/lib/wallet/server": {
      WalletProvisioningPausedError,
      lookupExistingWallet: async id => { calls.push(["lookup", id]); return options.existing || null; },
      provisionWallet: async (...args) => { calls.push(["provision", ...args]); if (options.pauseDuringProvision) throw new WalletProvisioningPausedError(); },
    },
    "@/lib/wallet/diagnostics": { walletDiagnostic: () => ({ reason: "test" }) },
    "@/lib/wallet/recovery-server": { primaryEmail: async id => { calls.push(["email", id]); if (options.emailError) throw new Error("test email unavailable"); return options.noEmail ? null : "owner@example.test"; } },
  }, env);
  const request = (body = { publicKey: key }, origin = "https://example.test") => new Request("https://example.test/api/wallet/start", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
  return { ...exports, calls, request };
}

test("new wallet provisioning is off unless the dedicated flag is exactly true", () => {
  for (const flag of [undefined, "", "false", "TRUE", "1"]) {
    assert.equal(config({ ...activeEnv, WALLET_PROVISIONING_ENABLED: flag }).walletProvisioningEnabled(), false);
  }
  assert.equal(config({ ...activeEnv, WALLET_PROVISIONING_ENABLED: "true" }).walletProvisioningEnabled(), true);
});

test("provisioning flag cannot bypass incomplete wallet service configuration", () => {
  assert.equal(config({ ...activeEnv, DATABASE_URL: "", WALLET_PROVISIONING_ENABLED: "true" }).walletProvisioningEnabled(), false);
  assert.equal(config({ ...activeEnv, WALLET_ACTIVATION_ENABLED: "false", WALLET_PROVISIONING_ENABLED: "true" }).walletProvisioningEnabled(), false);
});

test("deep provisioning call while paused cannot construct the provider or query/create a suborg", async () => {
  const s = server();
  await assert.rejects(s.provisionWallet(userId, key, "owner@example.test"), error => error.code === "wallet_provisioning_paused");
  assert.deepEqual(s.calls, ["lock", "lookup"]);
});

test("existing wallet retry returns the same mapping without touching Turnkey while paused", async () => {
  const s = server({ existing });
  assert.equal(await s.provisionWallet(userId, "03" + "cd".repeat(32)), existing);
  assert.deepEqual(s.calls, ["lock", "lookup"]);
});

test("deep existing lookup is preserved even when service activation is unavailable", async () => {
  const s = server({ existing, env: { WALLET_ACTIVATION_ENABLED: "false" } });
  assert.equal(await s.provisionWallet(userId, key), existing);
  assert.equal(s.calls.includes("sdk"), false);
});

test("explicit enable performs the mocked creation path only after lock and ownership lookup", async () => {
  const s = server({ env: { WALLET_PROVISIONING_ENABLED: "true" } });
  const result = await s.provisionWallet(userId, key, "owner@example.test");
  assert.equal(result.organizationId, "new-org");
  assert.equal(s.calls.filter(call => call === "create").length, 1);
  assert.ok(s.calls.indexOf("lookup") < s.calls.indexOf("sdk"));
  assert.ok(s.calls.indexOf("identity") < s.calls.indexOf("create"));
});

test("explicit enable reuses an already indexed suborg instead of creating another", async () => {
  const s = server({ matches: ["indexed-org"], env: { WALLET_PROVISIONING_ENABLED: "true" } });
  assert.equal((await s.provisionWallet(userId, key)).organizationId, "indexed-org");
  assert.equal(s.calls.includes("create"), false);
});

test("start rejects unauthenticated requests before lookup, email, or provisioning", async () => {
  const r = start({ unauthorized: true });
  assert.equal((await r.POST(r.request())).status, 401);
  assert.deepEqual(r.calls, []);
});

test("start rejects a foreign origin before any wallet lookup or provider action", async () => {
  const r = start({ existing });
  assert.equal((await r.POST(r.request(undefined, "https://attacker.example"))).status, 403);
  assert.deepEqual(r.calls, []);
});

test("start rejects malformed public keys before existing lookup", async () => {
  const r = start();
  assert.equal((await r.POST(r.request({ publicKey: "not-a-key" }))).status, 400);
  assert.deepEqual(r.calls, []);
});

test("start paused new account returns an explicit code without Clerk email or provider calls", async () => {
  const r = start({ emailError: true });
  const response = await r.POST(r.request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "wallet_provisioning_paused");
  assert.deepEqual(r.calls, [["lookup", userId]]);
});

test("start preserves existing account no-op before email lookup, even with a different browser key", async () => {
  const r = start({ existing, emailError: true });
  const response = await r.POST(r.request({ publicKey: "03" + "cd".repeat(32) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).connected, true);
  assert.deepEqual(r.calls, [["lookup", userId]]);
});

test("enabled start still requires a verified account email before provisioning", async () => {
  const r = start({ noEmail: true, env: { WALLET_PROVISIONING_ENABLED: "true" } });
  const response = await r.POST(r.request());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "email_required");
  assert.equal(r.calls.some(call => call[0] === "provision"), false);
});

test("enabled start delegates once with authenticated identity and verified email", async () => {
  const r = start({ env: { WALLET_PROVISIONING_ENABLED: "true" } });
  assert.equal((await r.POST(r.request())).status, 200);
  assert.deepEqual(r.calls, [["lookup", userId], ["email", userId], ["provision", userId, key, "owner@example.test"]]);
});

test("deep pause detected after route admission remains a safe explicit 503", async () => {
  const r = start({ pauseDuringProvision: true, env: { WALLET_PROVISIONING_ENABLED: "true" } });
  const response = await r.POST(r.request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "wallet_provisioning_paused");
});

test("wallet GET disables only new activation and preserves existing mapping and service availability", async () => {
  const calls = [];
  const exports = load("wallet", {
    "@clerk/nextjs/server": { auth: async () => ({ userId }) },
    "next/server": { NextResponse: { json: Response.json } },
    "drizzle-orm": { eq: (...args) => args },
    "@/lib/db": { db: () => ({ select: () => ({ from: () => ({ where: () => { calls.push("lookup"); return rows([existing]); } }) }) }) },
    "@/lib/db/schema": { wallets: { clerkUserId: "clerk_user_id" } },
    "@/lib/wallet/config": config(),
  }, activeEnv);
  const response = await exports.GET();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.canActivate, false);
  assert.equal(payload.transfersEnabled, true);
  assert.equal(payload.wallet.organizationId, existing.organizationId);
  assert.equal(payload.wallet.evmAddress, existing.evmAddress);
  assert.deepEqual(calls, ["lookup"]);
});
