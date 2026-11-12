import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeFunctionData, erc20Abi, getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ERC20_TRANSFER_TOPIC, addressTopic, decodeSupportedTransfer,
  interpretEvmReceipt, tokenForTransfer,
} from "../lib/chain/base-operations.ts";
import {
  decodeOperations, explorerForOperation, isValidTransactionId,
  phaseLabel, operationsStorageKey,
} from "../lib/operations/tracker.ts";
import { validateBaseBroadcast } from "../lib/send/base-broadcast-policy.ts";
import {
  buildBaseUnsigned, isBaseAsset, verifyBaseSigned,
} from "../lib/send/base-tx.ts";

const owner = privateKeyToAccount("0x" + "11".repeat(32));
const other = privateKeyToAccount("0x" + "22".repeat(32));
const USDC = getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
const PAYEE = getAddress("0x3333333333333333333333333333333333333333");
const TEST_HASH = "0x" + "a".repeat(64);
const quote = {
  nonce: 3, gas: "65000", maxFeePerGas: "15000000",
  maxPriorityFeePerGas: "1000000", ethBalance: "1000000000000000000",
};

test("interpreta cuatro fases diferentes: no visto, confirmado, fallido y en progreso", () => {
  assert.equal(interpretEvmReceipt(null, 100).phase, "not_seen");
  assert.equal(interpretEvmReceipt({ status: "0x1", blockNumber: "0x64" }, 102).phase, "confirmed");
  assert.equal(interpretEvmReceipt({ status: "0x1", blockNumber: "0x64" }, 102).confirmations, 3);
  assert.equal(interpretEvmReceipt({ status: "0x0", blockNumber: "0x64" }, 102).phase, "failed");
  assert.equal(interpretEvmReceipt({ status: "0x1", blockNumber: "0x64" }, null).phase, "confirming");
});

test("detecta ingreso real de USDC de 2.5 con contrato registrado y destinatario exacto", () => {
  const log = {
    address: USDC,
    topics: [ERC20_TRANSFER_TOPIC, addressTopic(owner.address), addressTopic(PAYEE)],
    data: "0x" + BigInt(2_500_000).toString(16).padStart(64, "0"),
    transactionHash: TEST_HASH,
    blockNumber: "0x65",
    logIndex: "0x1",
  };
  const decoded = decodeSupportedTransfer(log);
  assert.equal(decoded?.asset, "USDC");
  assert.equal(decoded?.amount, "2.5");
  assert.equal(decoded?.from.toLowerCase(), owner.address.toLowerCase());
  assert.equal(decoded?.to.toLowerCase(), PAYEE.toLowerCase());
  assert.equal(tokenForTransfer(PAYEE, [log]).length, 1);
  assert.equal(tokenForTransfer(owner.address, [log]).length, 0);
});

test("rechaza eventos falsos o eliminados; contrato y formato deben ser oficiales", () => {
  const valid = {
    address: USDC,
    topics: [ERC20_TRANSFER_TOPIC, addressTopic(owner.address), addressTopic(PAYEE)],
    data: "0x" + BigInt(100).toString(16).padStart(64, "0"),
    transactionHash: TEST_HASH,
  };
  assert.equal(decodeSupportedTransfer({ ...valid, removed: true }), null);
  assert.equal(decodeSupportedTransfer({ ...valid, address: owner.address }), null);
  assert.equal(decodeSupportedTransfer({ ...valid, topics: ["0x" + "0".repeat(64)] }), null);
  assert.equal(decodeSupportedTransfer({ ...valid, data: "0x1234" }), null);
  assert.equal(decodeSupportedTransfer({ ...valid, data: "0x" + "0".repeat(64) }), null);
});

test("tracker rechaza hash inválido, otro usuario, duplicados y prototipos corruptos", () => {
  assert.equal(isValidTransactionId("base", TEST_HASH), true);
  assert.equal(isValidTransactionId("base", "0x1234"), false);
  assert.equal(isValidTransactionId("bitcoin", "0x" + "1".repeat(64)), false);
  assert.equal(operationsStorageKey("user_ABCdef1234"), "vandefi.operation-tracker.v2.user_ABCdef1234");
  assert.throws(() => operationsStorageKey("admin/../../other"), /invalid_user_id/);
  assert.deepEqual(decodeOperations("not-json"), []);
  const item = {
    id: TEST_HASH, network: "base", label: "2.50 USDC", direction: "out",
    createdAt: "2026-11-09T20:00:00Z", phase: "confirmed", confirmations: 4,
  };
  const data = decodeOperations(JSON.stringify([item, item, { ...item, id: "javascript:alert(1)" }]));
  assert.equal(data.length, 1);
  assert.equal(data[0].phase, "confirmed");
  assert.equal(phaseLabel("not_seen"), "Aún no localizada");
  assert.equal(explorerForOperation(data[0]), "https://basescan.org/tx/" + TEST_HASH);
  assert.equal(explorerForOperation({ network: "base", id: "javascript:alert(1)" }), "");
});

test("Base relay autoriza únicamente transfer de USDC firmado por la wallet", async () => {
  const request = buildBaseUnsigned({ asset: "USDC", to: PAYEE, value: BigInt(2500000), quote }).request;
  const signed = await owner.signTransaction(request);
  const result = await validateBaseBroadcast(signed, owner.address);
  assert.equal(result.asset, "USDC");
  assert.equal(result.recipient.toLowerCase(), PAYEE.toLowerCase());
  assert.equal(result.amount, BigInt(2500000));
  assert.equal(result.chainId, 8453);
  assert.equal(await verifyBaseSigned(signed, { from: owner.address,
    unsigned: buildBaseUnsigned({ asset: "USDC", to: PAYEE, value: BigInt(2500000), quote }).unsigned }), signed);
});

test("Base relay rechaza otra cadena, otra wallet y método approve", async () => {
  const normal = buildBaseUnsigned({ asset: "USDC", to: PAYEE, value: BigInt(1000000), quote }).request;
  await assert.rejects(validateBaseBroadcast(await owner.signTransaction({ ...normal, chainId: 137 }), owner.address), /red_incorrecta/);
  await assert.rejects(validateBaseBroadcast(await other.signTransaction(normal), owner.address), /tx_ajena/);
  const approval = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PAYEE, BigInt(100)] });
  await assert.rejects(validateBaseBroadcast(await owner.signTransaction({ ...normal, data: approval }), owner.address), /metodo_no_permitido/);
});

test("Base relay rechaza contrato arbitrario y valor nativo en USDC", async () => {
  const normal = buildBaseUnsigned({ asset: "USDC", to: PAYEE, value: BigInt(1000000), quote }).request;
  await assert.rejects(validateBaseBroadcast(await owner.signTransaction({ ...normal, to: PAYEE }), owner.address), /contrato_no_permitido/);
  await assert.rejects(validateBaseBroadcast(await owner.signTransaction({ ...normal, value: BigInt(1000000000000000) }), owner.address), /valor_nativo_no_permitido/);
});

test("Base relay permite envío nativo ETH normal y no firma transacciones sin monto", async () => {
  const tx = buildBaseUnsigned({ asset: "ETH", to: PAYEE, value: BigInt(5000), quote }).request;
  const signed = await owner.signTransaction(tx);
  const result = await validateBaseBroadcast(signed, owner.address);
  assert.equal(result.asset, "ETH");
  assert.equal(result.amount, BigInt(5000));
  await assert.rejects(validateBaseBroadcast(await owner.signTransaction({ ...tx, value: BigInt(0) }), owner.address), /monto_invalido/);
});

test("Base valida exactamente los activos soportados, no propiedades heredadas", () => {
  for (const asset of ["USDC", "USDT", "cbBTC", "ETH"]) assert.equal(isBaseAsset(asset), true);
  for (const asset of ["toString", "constructor", "__proto__", "MATIC"]) assert.equal(isBaseAsset(asset), false);
});

test("firma con prioridad de comisión cambiada debe ser rechazada", async () => {
  const { unsigned, request } = buildBaseUnsigned({ asset: "USDC", to: PAYEE, value: BigInt(123456), quote });
  const tampered = await owner.signTransaction({ ...request, maxPriorityFeePerGas: BigInt(2000000) });
  await assert.rejects(verifyBaseSigned(tampered, { from: owner.address, unsigned }), /firma_altero_maxPriorityFeePerGas/);
});
