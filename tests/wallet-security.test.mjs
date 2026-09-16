import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertIdentity, digest, equalSecret, validPublicKey, allowedOrigin, newOAuthChallenge } from "../lib/wallet/security.ts";
import { BASE_USDC, NATIVE_BTC, sameAsset, toBaseUnits, formatBaseUnits } from "../lib/payments/assets.ts";

const key = "0394e549c71fa99dd5cf752fba623090be314949b74e4cdf7ca72031dd638e281a";
test("OIDC nonce uses Turnkey's documented hash of the public-key string", () => {
  assert.equal(digest(key), "1663bba492a323085b13895634a3618792c4ec6896f3c34ef3c26396df22ef82");
});
test("an otherwise valid identity cannot attach another user or device", () => {
  const claims = { sub: "user_A", nonce: digest(key), aud: "client" };
  assert.doesNotThrow(() => assertIdentity(claims, "user_A", key, "client"));
  assert.throws(() => assertIdentity(claims, "user_B", key, "client"));
  assert.throws(() => assertIdentity(claims, "user_A", key + "0", "client"));
  assert.throws(() => assertIdentity({ ...claims, nonce: undefined }, "user_A", key, "client"));
  assert.throws(() => assertIdentity({ ...claims, aud: ["client", "attacker"] }, "user_A", key, "client"));
  assert.throws(() => assertIdentity({ ...claims, azp: "attacker" }, "user_A", key, "client"));
});
test("OAuth uses fresh state and S256 PKCE; callbacks reject missing state", () => {
  const a = newOAuthChallenge(), b = newOAuthChallenge();
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.verifier, b.verifier);
  assert.equal(a.challenge, createHash("sha256").update(a.verifier).digest("base64url"));
  assert.equal(equalSecret(a.state, a.state), true);
  for (const value of [null, undefined, "", b.state]) assert.equal(equalSecret(a.state, value), false);
});
test("start rejects foreign origins and malformed public keys", () => {
  assert.equal(allowedOrigin("https://vandefi.live", "https://vandefi.live"), true);
  for (const origin of [null, "https://vandefi.live.attacker.tld", "http://vandefi.live"]) assert.equal(allowedOrigin(origin, "https://vandefi.live"), false);
  assert.equal(validPublicKey("02" + "ab".repeat(32)), true);
  for (const input of [null, 123, "04" + "ab".repeat(32), "02", "02" + "zz".repeat(32)]) assert.equal(validPublicKey(input), false);
});
test("same ticker on another chain or contract is not the same payment asset", () => {
  assert.equal(sameAsset(BASE_USDC, { ...BASE_USDC, chainId: 1 }), false);
  assert.equal(sameAsset(BASE_USDC, { ...BASE_USDC, address: "0x0000" }), false);
  assert.equal(sameAsset(NATIVE_BTC, { ...NATIVE_BTC, chainId: 8453, address: "cbBTC" }), false);
});
test("USDC and BTC amounts preserve exact base units without floating-point rounding", () => {
  assert.equal(toBaseUnits("0.00000001", 8), "1");
  assert.equal(toBaseUnits("900000000000.123456", 6), "900000000000123456");
  assert.equal(formatBaseUnits("900000000000123456", 6), "900000000000.123456");
  assert.equal(formatBaseUnits("0x0", 6), "0");
  for (const input of ["0", "-1", "1e9", "0.0000001", "1,23", "NaN"]) assert.throws(() => toBaseUnits(input, 6));
});
