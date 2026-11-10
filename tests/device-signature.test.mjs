import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createWalletSessionGuard } from "../lib/wallet/session.ts";
import * as viem from "viem";
import { privateKeyToAccount } from "viem/accounts";

const owner = privateKeyToAccount("0x" + "11".repeat(32));
const stranger = privateKeyToAccount("0x" + "22".repeat(32));
const identity = { organizationId: "org_test", turnkeyUserId: "owner_test", evmAddress: owner.address };
const TIME = Date.parse("2026-11-09T22:00:00Z");
const timestamp = new Date(TIME).toISOString();
const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/wallet/device-signature.ts", import.meta.url), "utf8"),
  { fileName: "device-signature.ts", compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } },
).outputText;

function device(options = {}) {
  const state = { reads: 0, clients: 0, whoami: 0, signatures: 0, polls: 0, payloads: [], randomCalls: 0 };
  let completed;
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [TIME])); }
    static now() { return TIME; }
  }
  class TurnkeyClient {
    constructor(_config, stamper) { state.clients++; assert.equal(stamper.getPublicKey(), "existing-device-key"); }
    async getWhoami({ organizationId }) {
      state.whoami++;
      assert.equal(organizationId, identity.organizationId);
      if (options.whoamiFailure) throw new Error("do not expose this provider response");
      return options.whoami || { organizationId, userId: identity.turnkeyUserId };
    }
    async signRawPayload(request) {
      state.signatures++;
      assert.equal(request.type, "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2");
      assert.equal(request.organizationId, identity.organizationId);
      assert.equal(request.timestampMs, String(TIME));
      assert.equal(request.parameters.signWith, owner.address);
      assert.equal(request.parameters.encoding, "PAYLOAD_ENCODING_HEXADECIMAL");
      assert.equal(request.parameters.hashFunction, "HASH_FUNCTION_NO_OP");
      assert.equal(request.parameters.payload.length, 64);
      state.payloads.push(request.parameters.payload);
      if (options.signFailure) throw new Error("sensitive provider failure/signature must not escape");
      const signature = viem.parseSignature(await (options.signer || owner).sign({ hash: "0x" + request.parameters.payload }));
      completed = {
        id: "activity_test", organizationId: options.activityOrg || identity.organizationId,
        status: options.status || "ACTIVITY_STATUS_COMPLETED",
        result: { signRawPayloadResult: options.signature || {
          r: signature.r.slice(2), s: signature.s.slice(2), v: String(Number(signature.v) - 27),
        } },
      };
      return { activity: options.pending ? { ...completed, status: "ACTIVITY_STATUS_PENDING" } : completed };
    }
    async getActivity(request) {
      state.polls++;
      assert.equal(request.organizationId, identity.organizationId);
      assert.equal(request.activityId, "activity_test");
      return { activity: completed };
    }
    // Any attempted transaction, SDK-generated key or broadcast is a test failure.
    async signTransaction() { assert.fail("diagnostic must not sign transactions"); }
  }
  const exports = {};
  const context = {
    exports, window: {}, Date: FixedDate,
    crypto: { getRandomValues(bytes) { state.randomCalls++; return bytes.fill(state.randomCalls); } },
    setTimeout(callback) { callback(); },
    require(name) {
      if (name === "viem") return viem;
      if (name === "@/lib/wallet/session") return { walletSession: sessionGuard };
      if (name === "@turnkey/http") return { TurnkeyClient };
      if (name === "@/lib/wallet/browser") return {
        existingWalletDeviceStamper: async () => {
          state.reads++;
          return options.missingKey ? null : { getPublicKey: () => "existing-device-key" };
        },
      };
      assert.fail("unexpected network/storage dependency: " + name);
    },
  };
  if (options.server) delete context.window;
  if (options.noCrypto) delete context.crypto;
  vm.runInNewContext(compiled, context, { filename: "device-signature.ts" });
  return { api: exports, state };
}

function expectedMessage(nonce = "01".repeat(32)) {
  return [
    "VanDeFi: comprobación de firma del dispositivo",
    "Solo diagnóstico. No autoriza transferencias, contratos, sesiones ni acceso a fondos.",
    "Wallet: " + owner.address,
    "Organización: " + identity.organizationId,
    "Usuario Turnkey: " + identity.turnkeyUserId,
    "Fecha: " + timestamp,
    "Nonce: " + nonce,
  ].join("\n");
}

test("diagnóstico verifica firma EIP191 real y devuelve únicamente resultado y fecha", async () => {
  const d = device();
  const result = await d.api.checkWalletSignature(identity);
  assert.equal(result.verified, true);
  assert.equal(result.checkedAt, timestamp);
  assert.deepEqual(Object.keys(result).sort(), ["checkedAt", "verified"]);
  assert.equal(d.state.payloads[0], viem.hashMessage(expectedMessage()).slice(2));
  assert.equal(d.state.whoami, 1);
  assert.equal(d.state.signatures, 1);
});

test("sin clave existente no crea cliente ni solicita firma", async () => {
  const d = device({ missingKey: true });
  await assert.rejects(d.api.checkWalletSignature(identity), /dispositivo_no_autorizado/);
  assert.equal(d.state.reads, 1);
  assert.equal(d.state.clients, 0);
  assert.equal(d.state.signatures, 0);
});

test("owner u organización distintos impiden cualquier solicitud de firma", async () => {
  for (const whoami of [
    { organizationId: "other_org", userId: identity.turnkeyUserId },
    { organizationId: identity.organizationId, userId: "other_owner" },
  ]) {
    const d = device({ whoami });
    await assert.rejects(d.api.checkWalletSignature(identity), /dispositivo_identidad_incorrecta/);
    assert.equal(d.state.signatures, 0);
  }
});

test("firma válida de otra wallet no pasa el diagnóstico", async () => {
  const d = device({ signer: stranger });
  await assert.rejects(d.api.checkWalletSignature(identity), /firma_wallet_incorrecta/);
  assert.equal(d.state.signatures, 1);
});

test("firma incompleta, recovery byte inválido y actividad de otra organización se rechazan", async () => {
  for (const options of [
    { signature: { r: "deadbeef", s: "01".repeat(32), v: "0" } },
    { signature: { r: "01".repeat(32), s: "01".repeat(32), v: "2" } },
    { activityOrg: "other_org" },
  ]) {
    const d = device(options);
    await assert.rejects(d.api.checkWalletSignature(identity), /firma_invalida/);
  }
});

test("cada comprobación incluye nonce nuevo incluso con mismo timestamp", async () => {
  const d = device();
  await d.api.checkWalletSignature(identity);
  await d.api.checkWalletSignature(identity);
  assert.equal(d.state.payloads[1], viem.hashMessage(expectedMessage("02".repeat(32))).slice(2));
  assert.notEqual(d.state.payloads[0], d.state.payloads[1]);
});

test("actividad pendiente se consulta antes de verificar resultado completo", async () => {
  const d = device({ pending: true });
  assert.equal((await d.api.checkWalletSignature(identity)).verified, true);
  assert.equal(d.state.polls, 1);
  assert.equal(d.state.signatures, 1);
});

test("errores del proveedor y solicitudes de consenso no exponen respuestas o firmas", async () => {
  for (const [options, expected] of [
    [{ whoamiFailure: true }, "dispositivo_no_autorizado"],
    [{ signFailure: true }, "firma_rechazada"],
    [{ status: "ACTIVITY_STATUS_CONSENSUS_NEEDED" }, "requiere_aprobacion"],
  ]) {
    const d = device(options);
    await assert.rejects(d.api.checkWalletSignature(identity), error => error.message === expected);
  }
});

test("servidor, falta de criptografía y campos con inyección no leen la clave", async () => {
  for (const [options, input, expected] of [
    [{ server: true }, identity, "solo_navegador"],
    [{ noCrypto: true }, identity, "sin_criptografia_segura"],
    [{}, { ...identity, organizationId: "org\ntransfer" }, "dispositivo_identidad_incorrecta"],
  ]) {
    const d = device(options);
    await assert.rejects(d.api.checkWalletSignature(input), error => error.message === expected);
    assert.equal(d.state.reads, 0);
    assert.equal(d.state.signatures, 0);
  }
});

const signerCompiled = ts.transpileModule(
  readFileSync(new URL("../lib/send/signer.ts", import.meta.url), "utf8"),
  { fileName: "signer.ts", compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } },
).outputText;

function legacySigner(missingKey = false, switchDuringRead = false) {
  const sessionGuard = createWalletSessionGuard();
  sessionGuard.synchronize("user-a", "session-a");
  const state = { readonlyReads: 0, clients: 0, signCalls: 0 };
  class TurnkeyClient {
    constructor(_config, stamper) { state.clients++; assert.equal(stamper.getPublicKey(), "existing-device-key"); }
    async signTransaction(request) {
      state.signCalls++;
      assert.equal(request.organizationId, identity.organizationId);
      assert.equal(request.parameters.signWith, owner.address);
      return { activity: { id: "legacy_test", status: "ACTIVITY_STATUS_COMPLETED",
        result: { signTransactionResult: { signedTransaction: "diagnostic-mock-transaction" } } } };
    }
    async signRawPayloads(request) {
      state.signCalls++;
      assert.equal(request.organizationId, identity.organizationId);
      return { activity: { id: "legacy_test", status: "ACTIVITY_STATUS_COMPLETED",
        result: { signRawPayloadsResult: { signatures: request.parameters.payloads.map(() => ({ r: "mock-r", s: "mock-s", v: "0" })) } } } };
    }
  }
  const exports = {};
  vm.runInNewContext(signerCompiled, {
    exports,
    require(name) {
      if (name === "@/lib/wallet/session") return { walletSession: sessionGuard };
      if (name === "@turnkey/http") return { TurnkeyClient };
      if (name === "@/lib/wallet/browser") return {
        existingWalletDeviceStamper: async () => {
          state.readonlyReads++;
          if (switchDuringRead) sessionGuard.synchronize("user-b", "session-b");
          return missingKey ? null : { getPublicKey: () => "existing-device-key" };
        },
      };
      assert.fail("legacy signer attempted key creation or unexpected IO: " + name);
    },
  }, { filename: "signer.ts" });
  return { api: exports, state };
}

test("firmantes BTC, Base y EVM sin clave nunca inicializan ni crean otra clave", async () => {
  const d = legacySigner(true);
  await assert.rejects(d.api.signBitcoinHashes(identity.organizationId, "bitcoin-test", ["fixture"]), /dispositivo_no_autorizado/);
  await assert.rejects(d.api.signBaseTransaction(identity.organizationId, owner.address, "fixture"), /dispositivo_no_autorizado/);
  await assert.rejects(d.api.signEvmTransaction(identity.organizationId, owner.address, "fixture"), /dispositivo_no_autorizado/);
  assert.equal(d.state.readonlyReads, 3);
  assert.equal(d.state.clients, 0);
  assert.equal(d.state.signCalls, 0);
});

test("firmantes existentes conservan flujo BTC y EVM usando únicamente clave existente", async () => {
  const d = legacySigner();
  const btc = await d.api.signBitcoinHashes(identity.organizationId, "bitcoin-test", ["fixture"]);
  assert.equal(btc.length, 1);
  assert.equal(await d.api.signBaseTransaction(identity.organizationId, owner.address, "fixture"), "diagnostic-mock-transaction");
  assert.equal(await d.api.signEvmTransaction(identity.organizationId, owner.address, "fixture"), "diagnostic-mock-transaction");
  assert.equal(d.state.readonlyReads, 3);
  assert.equal(d.state.clients, 3);
  assert.equal(d.state.signCalls, 3);
});


test("account change while loading the device cancels before requesting a transaction signature", async () => {
  const d = legacySigner(false, true);
  await assert.rejects(d.api.signBaseTransaction(identity.organizationId, owner.address, "fixture"), /wallet_session_changed/);
  assert.equal(d.state.signCalls, 0);
});
