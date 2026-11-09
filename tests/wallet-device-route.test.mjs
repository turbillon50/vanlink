import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/api/wallet/device/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const publicKey = "02" + "ab".repeat(32);
const fingerprint = createHash("sha256").update(publicKey).digest("hex").slice(0, 16);
function route(options = {}) {
  const calls = [];
  class SendError extends Error {
    constructor(code, status = 400, message = code) { super(message); this.code = code; this.status = status; }
  }
  const wallet = options.wallet || { organizationId: "account-org", turnkeyUserId: "account-owner" };
  const client = {
    getApiKeys: async args => { calls.push(["keys", args]); if (options.providerError) throw new Error("private-provider-detail"); return { apiKeys: options.keys || [{ credential: { type: "CREDENTIAL_TYPE_API_KEY_P256", publicKey } }] }; },
    getUsers: async args => { calls.push(["users", args]); return { users: options.users || [{ userId: wallet.turnkeyUserId, userEmail: "" }] }; },
  };
  const imports = {
    "node:crypto": { createHash },
    "@turnkey/sdk-server": { Turnkey: class { apiClient() { return client; } } },
    "@/lib/send/server": { SendError, noStore: { "Cache-Control": "no-store" }, currentWallet: async () => { if (options.unauthorized) throw new SendError("no_autenticado", 401); return wallet; } },
    "@/lib/wallet/config": { walletConfig: () => ({ parentId: "parent" }) },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, Response, process: { env: {} }, require: name => { assert.ok(Object.hasOwn(imports, name)); return imports[name]; } }, { timeout: 5000 });
  return { get: exports.GET, calls };
}

test("diagnóstico rechaza sesión ausente antes de consultar Turnkey", async () => {
  const r = route({ unauthorized: true }); const response = await r.get();
  assert.equal(response.status, 401); assert.equal(r.calls.length, 0);
});

test("consulta exclusivamente organización y dueño de la cuenta autenticada", async () => {
  const r = route({ wallet: { organizationId: "other-owned-org", turnkeyUserId: "other-owned-user" } });
  const response = await r.get(new Request("https://example.test/api/wallet/device?organizationId=foreign&userId=foreign"));
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(r.calls), JSON.stringify([["keys", { organizationId: "other-owned-org", userId: "other-owned-user" }], ["users", { organizationId: "other-owned-org" }]]));
});

test("devuelve huella pública, no clave ni credenciales, y prohíbe caché", async () => {
  const response = await route().get(); const data = await response.json();
  assert.deepEqual(data.registeredDeviceFingerprints, [fingerprint]);
  assert.equal(data.recoveryEmailPresent, false);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(JSON.stringify(data).includes(publicKey), false);
  assert.deepEqual(Object.keys(data).sort(), ["checkedAt", "recoveryEmailPresent", "registeredDeviceFingerprints"]);
});

test("deduplica huellas P256 y descarta otros tipos o formatos", async () => {
  const keys = [
    { credential: { type: "CREDENTIAL_TYPE_API_KEY_P256", publicKey: "0x" + publicKey.toUpperCase() } },
    { credential: { type: "CREDENTIAL_TYPE_API_KEY_P256", publicKey } },
    { credential: { type: "CREDENTIAL_TYPE_API_KEY_SECP256K1", publicKey: "03" + "cd".repeat(32) } },
    { credential: { type: "CREDENTIAL_TYPE_API_KEY_P256", publicKey: "not-a-key" } },
  ];
  const response = await route({ keys }).get();
  assert.deepEqual((await response.json()).registeredDeviceFingerprints, [fingerprint]);
});

test("el correo de otra persona no habilita recuperación del dueño", async () => {
  const response = await route({ users: [{ userId: "stranger", userEmail: "foreign@example.test" }] }).get();
  assert.equal(response.status, 502); assert.equal((await response.json()).error, "dueno_no_localizado");
});

test("un error del proveedor no revela detalles y no se presenta como pérdida de llave", async () => {
  const response = await route({ providerError: true }).get(); const data = await response.json();
  assert.equal(response.status, 503); assert.equal(JSON.stringify(data).includes("private-provider-detail"), false);
  assert.match(data.message, /llave se conserva/);
});
