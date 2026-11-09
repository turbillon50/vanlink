import test from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, erc20Abi, parseTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POLYGON_CHAIN_ID, POLYGON_USDC_ADDRESS } from "../lib/polygon/asset.ts";
import {
  normalizePolygonAddress, polygonUSDCUnits, buildPolygonUSDCUnsigned,
  verifyPolygonUSDCSigned, maxPolygonGas,
} from "../lib/send/polygon-tx.ts";

const owner = privateKeyToAccount("0x" + "11".repeat(32));
const recipient = "0x1111111111111111111111111111111111111111";
const quote = {
  nonce: 2, gas: "85000", maxFeePerGas: "70000000000",
  maxPriorityFeePerGas: "30000000000", usdcBalance: "20000000",
  polBalance: "1000000000000000000", issuedAt: Date.now(),
};

test("Polygon USDC nativo usa chainId 137 y contrato oficial Circle, no USDC.e", () => {
  assert.equal(POLYGON_CHAIN_ID, 137);
  assert.equal(POLYGON_USDC_ADDRESS.toLowerCase(), "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359");
  assert.notEqual(POLYGON_USDC_ADDRESS.toLowerCase(), "0x2791bca1f2de4661ed88a30c99a7a9449aa84174");
});

test("un monto USDC con seis decimales se convierte exactamente", () => {
  assert.equal(polygonUSDCUnits("10.123456"), BigInt(10123456));
  assert.equal(polygonUSDCUnits("0"), null);
  assert.equal(polygonUSDCUnits("0.0000001"), null);
  assert.equal(polygonUSDCUnits("-1"), null);
});

test("se rechaza una dirección inválida o cero", () => {
  assert.equal(normalizePolygonAddress("0x0000000000000000000000000000000000000000"), null);
  assert.equal(normalizePolygonAddress("not-an-address"), null);
  assert.equal(normalizePolygonAddress(recipient)?.toLowerCase(), recipient.toLowerCase());
});

test("transacción USDC tiene to=contrato Circle, no mueve POL y conserva el destinatario", () => {
  const result = buildPolygonUSDCUnsigned({ to: recipient, amount: BigInt(5000000), quote });
  const tx = parseTransaction(result.unsigned);
  assert.equal(tx.chainId, 137);
  assert.equal(tx.to?.toLowerCase(), POLYGON_USDC_ADDRESS.toLowerCase());
  assert.equal(tx.value ?? BigInt(0), BigInt(0));
  assert.equal(tx.type, "eip1559");
  const args = decodeFunctionData({ abi: erc20Abi, data: tx.data, functionName: "transfer" });
  assert.equal(args.args[0].toLowerCase(), recipient.toLowerCase());
  assert.equal(args.args[1], BigInt(5000000));
  assert.equal(maxPolygonGas(quote), BigInt(85000) * BigInt(70000000000));
});

test("Turnkey firma EVM y la verificación rechaza cambios y remitente ajeno", async () => {
  const result = buildPolygonUSDCUnsigned({ to: recipient, amount: BigInt(7500000), quote });
  const signed = await owner.signTransaction(result.tx);
  assert.equal(await verifyPolygonUSDCSigned(signed, { from: owner.address, unsigned: result.unsigned }), signed);
  await assert.rejects(verifyPolygonUSDCSigned(signed, { from: recipient, unsigned: result.unsigned }), /wrong_signer/);

  const modified = buildPolygonUSDCUnsigned({ to: recipient, amount: BigInt(8500000), quote });
  await assert.rejects(verifyPolygonUSDCSigned(signed, { from: owner.address, unsigned: modified.unsigned }), /signed_changed_data/);
});
