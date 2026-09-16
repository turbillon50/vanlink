import test from "node:test";
import assert from "node:assert/strict";
import { digest, equalSecret, validPublicKey, allowedOrigin } from "../lib/wallet/security.ts";
import { DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS, DEFAULT_ETHEREUM_ACCOUNTS } from "@turnkey/sdk-server";
import { BASE_USDC, NATIVE_BTC, sameAsset, toBaseUnits, formatBaseUnits } from "../lib/payments/assets.ts";

const key = "0394e549c71fa99dd5cf752fba623090be314949b74e4cdf7ca72031dd638e281a";
test("device public-key hash is deterministic", () => {
  assert.equal(digest(key), "1663bba492a323085b13895634a3618792c4ec6896f3c34ef3c26396df22ef82");
});
test("device key values are bounded and constant-time comparison rejects mismatches", () => {
  assert.equal(equalSecret(key, key), true);
  for (const value of [null, undefined, "", key + "0"]) assert.equal(equalSecret(key, value), false);
});
test("start rejects foreign origins and malformed public keys", () => {
  assert.equal(allowedOrigin("https://vandefi.live", "https://vandefi.live"), true);
  for (const origin of [null, "https://vandefi.live.attacker.tld", "http://vandefi.live"]) assert.equal(allowedOrigin(origin, "https://vandefi.live"), false);
  assert.equal(validPublicKey("02" + "ab".repeat(32)), true);
  for (const input of [null, 123, "04" + "ab".repeat(32), "02", "02" + "zz".repeat(32)]) assert.equal(validPublicKey(input), false);
});
test("every VanLink wallet starts with one Base-compatible EVM account and one native Bitcoin account", () => {
  assert.deepEqual(DEFAULT_ETHEREUM_ACCOUNTS.map(account => account.addressFormat), ["ADDRESS_FORMAT_ETHEREUM"]);
  assert.deepEqual(DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS.map(account => account.addressFormat), ["ADDRESS_FORMAT_BITCOIN_MAINNET_P2WPKH"]);
  assert.equal(DEFAULT_ETHEREUM_ACCOUNTS.length + DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS.length, 2);
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
