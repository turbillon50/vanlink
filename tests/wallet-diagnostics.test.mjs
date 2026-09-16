import test from "node:test";
import assert from "node:assert/strict";
import { walletDiagnostic, walletStep } from "../lib/wallet/diagnostics.ts";

test("provider diagnostics never include token-bearing messages, responses or nested causes", () => {
  const secret = "sensitive-identity-token-that-must-not-be-logged";
  const error = Object.assign(new Error(`OIDC validation failed: ${secret}`), {
    code: 3, response: { body: secret }, cause: new Error(secret),
  });
  const result = walletDiagnostic(error);
  assert.deepEqual(result, { name: "Error", code: 3, reason: "identity" });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(walletDiagnostic({ name: secret, code: secret, message: secret }).code, undefined);
});

test("a failed provisioning step preserves the failure while recording only a safe stage summary", async t => {
  const error = new Error("invalid OIDC token: sensitive-test-token");
  const log = t.mock.method(console, "error", () => {});
  await assert.rejects(walletStep("identity_lookup", async () => { throw error; }), e => e === error);
  assert.equal(log.mock.callCount(), 1);
  assert.equal(log.mock.calls[0].arguments[0], "wallet_step_failed");
  assert.equal(log.mock.calls[0].arguments[1].step, "identity_lookup");
  assert.equal(JSON.stringify(log.mock.calls[0].arguments).includes("sensitive-test-token"), false);
});
