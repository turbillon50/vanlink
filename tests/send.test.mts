/**
 * Pruebas del armado y verificación de envíos (Bitcoin nativo y Base).
 * Firman con llaves locales desechables en lugar de Turnkey: el formato de
 * firma (r, s, v) es el mismo que devuelve Turnkey.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { Transaction, crypto as c, address, script } from "bitcoinjs-lib";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { decodeFunctionData, erc20Abi, parseTransaction } from "viem";
import {
  planBtcSend, buildBtcUnsigned, finalizeBtc, outputScript, btcToSats, satsToBtc, isValidBtcAddress,
} from "../lib/send/bitcoin-tx";
import { buildBaseUnsigned, verifyBaseSigned, normalizeEvmAddress, toUnits, maxGasCost } from "../lib/send/base-tx";

const N = secp256k1.Point.CURVE().n;
function key() {
  const priv = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(priv, true);
  return { priv, addr: address.toBech32(c.hash160(pub), 0, "bc") };
}
function turnkeyLike(priv: Uint8Array, hash: string, forceHighS = false) {
  const b = secp256k1.sign(Buffer.from(hash, "hex"), priv, { prehash: false, format: "recovered" });
  let v = b[0], r = Buffer.from(b.subarray(1, 33)).toString("hex"), s = BigInt("0x" + Buffer.from(b.subarray(33)).toString("hex"));
  if (forceHighS) { s = N - s; v ^= 1; }
  return { r, s: s.toString(16).padStart(64, "0"), v: v.toString(16).padStart(2, "0") };
}
const utxo = (n: number, value: number) => ({ txid: n.toString(16).padStart(64, "a"), vout: n, value });
const DEST = "bc1qsddjvjlv58rnj8vwt2d4mx35hlpv030jevke8m";

test("BTC: envío con cambio, firma válida y tamaño real = estimado", () => {
  const k = key();
  const plan = planBtcSend({ utxos: [utxo(1, 1900)], to: DEST, amount: 1000, feeRate: 2, changeAddress: k.addr });
  assert.equal(plan.amount + plan.change + plan.fee, 1900);
  const u = buildBtcUnsigned(plan, k.addr);
  const out = finalizeBtc(u, u.sighashes.map(h => turnkeyLike(k.priv, h)));
  const tx = Transaction.fromHex(out.hex);
  assert.equal(tx.outs.length, 2);
  assert.equal(tx.outs[0].value, BigInt(1000));
  assert.deepEqual(Buffer.from(tx.outs[0].script), Buffer.from(outputScript(DEST).script));
  assert.ok(Math.abs(tx.virtualSize() - plan.vbytes) <= 1, `vsize ${tx.virtualSize()} vs ${plan.vbytes}`);
  assert.equal(tx.ins[0].sequence, 0xfffffffd);
});

test("BTC: firma high-S de Turnkey se normaliza a low-S y sigue siendo válida", () => {
  const k = key();
  const plan = planBtcSend({ utxos: [utxo(1, 50_000)], to: DEST, amount: 10_000, feeRate: 3, changeAddress: k.addr });
  const u = buildBtcUnsigned(plan, k.addr);
  const out = finalizeBtc(u, u.sighashes.map(h => turnkeyLike(k.priv, h, true)));
  const der = Transaction.fromHex(out.hex).ins[0].witness[0];
  const { signature } = script.signature.decode(der);
  const s = BigInt("0x" + Buffer.from(signature.subarray(32)).toString("hex"));
  assert.ok(s <= N / BigInt(2));
});

test("BTC: firma de otra llave se rechaza antes de transmitir", () => {
  const k = key(), otro = key();
  const plan = planBtcSend({ utxos: [utxo(1, 50_000)], to: DEST, amount: 10_000, feeRate: 3, changeAddress: k.addr });
  const u = buildBtcUnsigned(plan, k.addr);
  assert.throws(() => finalizeBtc(u, u.sighashes.map(h => turnkeyLike(otro.priv, h))), /llave_no_corresponde_a_origen/);
});

test("BTC: firma sobre otro hash se rechaza", () => {
  const k = key();
  const plan = planBtcSend({ utxos: [utxo(1, 50_000)], to: DEST, amount: 10_000, feeRate: 3, changeAddress: k.addr });
  const u = buildBtcUnsigned(plan, k.addr);
  const falso = "11".repeat(32);
  assert.throws(() => finalizeBtc(u, [turnkeyLike(k.priv, falso)]), /llave_no_corresponde_a_origen|firma_invalida/);
});

test("BTC: máximo vacía la wallet sin cambio; varias entradas", () => {
  const k = key();
  const plan = planBtcSend({ utxos: [utxo(1, 3000), utxo(2, 5000)], to: DEST, amount: "max", feeRate: 2, changeAddress: k.addr });
  assert.equal(plan.change, 0); assert.equal(plan.inputs.length, 2); assert.equal(plan.amount + plan.fee, 8000);
  const u = buildBtcUnsigned(plan, k.addr);
  const tx = Transaction.fromHex(finalizeBtc(u, u.sighashes.map(h => turnkeyLike(k.priv, h))).hex);
  assert.equal(tx.ins.length, 2); assert.equal(tx.outs.length, 1);
});

test("BTC: cambio que sería polvo se va a comisión, no se crea salida basura", () => {
  const k = key();
  const plan = planBtcSend({ utxos: [utxo(1, 1600)], to: DEST, amount: 1200, feeRate: 2, changeAddress: k.addr });
  assert.equal(plan.change, 0); assert.equal(plan.fee, 400);
});

test("BTC: rechazos (polvo, fondos, red de prueba, comisión)", () => {
  const k = key();
  assert.throws(() => planBtcSend({ utxos: [utxo(1, 1900)], to: DEST, amount: 200, feeRate: 2, changeAddress: k.addr }), /monto_bajo_polvo/);
  assert.throws(() => planBtcSend({ utxos: [utxo(1, 1900)], to: DEST, amount: 1800, feeRate: 2, changeAddress: k.addr }), /fondos_insuficientes/);
  assert.throws(() => planBtcSend({ utxos: [], to: DEST, amount: 1000, feeRate: 2, changeAddress: k.addr }), /sin_fondos/);
  assert.throws(() => planBtcSend({ utxos: [utxo(1, 1900)], to: DEST, amount: 1000, feeRate: 0, changeAddress: k.addr }), /comision_invalida/);
  assert.equal(isValidBtcAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"), false);
  assert.equal(isValidBtcAddress("bc1qsddjvjlv58rnj8vwt2d4mx35hlpv030jevke8x"), false, "checksum roto");
  for (const a of ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
    "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297"]) assert.ok(isValidBtcAddress(a), a);
});

test("BTC: conversión de montos exacta", () => {
  assert.equal(btcToSats("0.00001"), 1000);
  assert.equal(btcToSats("0,000019"), 1900);
  assert.equal(btcToSats("0.000000001"), null);
  assert.equal(btcToSats("abc"), null);
  assert.equal(satsToBtc(1900), "0.000019");
});

const quote = { nonce: 7, gas: "65000", maxFeePerGas: "20000000", maxPriorityFeePerGas: "1000000", ethBalance: "0" };
const DEST_EVM = "0x1111111111111111111111111111111111111111";

test("Base: transfer ERC-20 firmada localmente pasa la verificación", async () => {
  const acct = privateKeyToAccount(generatePrivateKey());
  const { request, unsigned } = buildBaseUnsigned({ asset: "USDC", to: DEST_EVM, value: BigInt(2_500_000), quote });
  const signed = await acct.signTransaction(request);
  const ok = await verifyBaseSigned(signed.slice(2), { from: acct.address, unsigned });
  const tx = parseTransaction(ok);
  assert.equal(tx.chainId, 8453); assert.equal(tx.to?.toLowerCase(), "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  const d = decodeFunctionData({ abi: erc20Abi, data: tx.data! });
  assert.equal(d.functionName, "transfer"); assert.equal(d.args[1], BigInt(2_500_000));
  assert.equal(maxGasCost(quote), BigInt(65000) * BigInt(20000000));
});

test("Base: firma de otra wallet o con contenido alterado se rechaza", async () => {
  const mia = privateKeyToAccount(generatePrivateKey()), ajena = privateKeyToAccount(generatePrivateKey());
  const { request, unsigned } = buildBaseUnsigned({ asset: "ETH", to: DEST_EVM, value: BigInt(10), quote });
  await assert.rejects(verifyBaseSigned(await ajena.signTransaction(request), { from: mia.address, unsigned }), /remitente_no_coincide/);
  const alterada = await mia.signTransaction({ ...request, value: BigInt(999) });
  await assert.rejects(verifyBaseSigned(alterada, { from: mia.address, unsigned }), /firma_altero_value/);
});

test("Base: direcciones y montos", () => {
  assert.equal(normalizeEvmAddress("0x0000000000000000000000000000000000000000"), null);
  assert.equal(normalizeEvmAddress("0xeeD9d568BFc08c7954875530c2Bd7Ab91f80B771"), null, "checksum roto");
  assert.equal(normalizeEvmAddress("0xeed9d568bfc08c7954875530c2bd7ab91f80b770"), "0xeeD9d568BFc08c7954875530c2Bd7Ab91f80B770");
  assert.equal(normalizeEvmAddress("bc1qsddjvjlv58rnj8vwt2d4mx35hlpv030jevke8m"), null);
  assert.equal(toUnits("1.5", "USDC"), BigInt(1_500_000));
  assert.equal(toUnits("1.1234567", "USDC"), null);
  assert.equal(toUnits("0", "ETH"), null);
});
