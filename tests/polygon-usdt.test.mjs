import test from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, erc20Abi, getAddress, keccak256, parseTransaction, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  POLYGON_CHAIN_ID, POLYGON_USDT_ADDRESS, POLYGON_USDT_DECIMALS, POLYGON_USDT_SYMBOL,
} from "../lib/polygon/asset.ts";
import {
  normalizePolygonAddress, polygonUSDTUnits, buildPolygonUSDTUnsigned,
  verifyPolygonUSDTSigned, maxPolygonGas,
} from "../lib/send/polygon-tx.ts";
import { ERC20_TRANSFER_TOPIC, decodePolygonUsdtTransfer } from "../lib/polygon/transfer-log.ts";

const owner = privateKeyToAccount("0x" + "11".repeat(32));
const other = privateKeyToAccount("0x" + "22".repeat(32));
const recipient = "0x1111111111111111111111111111111111111111";
const quote = {
  nonce: 2, gas: "85000", maxFeePerGas: "70000000000",
  maxPriorityFeePerGas: "30000000000", usdtBalance: "20000000",
  polBalance: "1000000000000000000", issuedAt: Date.now(),
};
const transfer = (amount = 7_500_000n) => buildPolygonUSDTUnsigned({ to: recipient, amount, quote });
const addressTopic = (address) => "0x" + address.slice(2).toLowerCase().padStart(64, "0");
const validLog = () => ({
  address: POLYGON_USDT_ADDRESS,
  topics: [ERC20_TRANSFER_TOPIC, addressTopic(owner.address), addressTopic(recipient)],
  data: "0x" + (10_000_000n).toString(16).padStart(64, "0"),
});

test("USDT Polygon usa chainId 137, contrato Tether aprobado y seis decimales", () => {
  assert.equal(POLYGON_CHAIN_ID, 137);
  assert.equal(POLYGON_USDT_ADDRESS.toLowerCase(), "0xc2132d05d31c914a87c6611c10748aeb04b58e8f");
  assert.equal(POLYGON_USDT_DECIMALS, 6);
  assert.equal(POLYGON_USDT_SYMBOL, "USDT");
  assert.notEqual(POLYGON_USDT_ADDRESS.toLowerCase(), "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359");
});

test("montos USDT conservan precisión y rechazan cero, negativos y más de seis decimales", () => {
  assert.equal(polygonUSDTUnits("10.123456"), 10_123_456n);
  assert.equal(polygonUSDTUnits("0.000001"), 1n);
  assert.equal(polygonUSDTUnits("10,25"), 10_250_000n);
  for (const value of ["0", "0.0000001", "-1", "1e6", "NaN", "", "1.2.3"]) {
    assert.equal(polygonUSDTUnits(value), null, value);
  }
});

test("direcciones Polygon rechazan cero y checksum mixto inválido", () => {
  assert.equal(normalizePolygonAddress("0x0000000000000000000000000000000000000000"), null);
  assert.equal(normalizePolygonAddress("not-an-address"), null);
  assert.equal(normalizePolygonAddress(owner.address.toLowerCase()), getAddress(owner.address));
  const checksum = owner.address.slice(2);
  const position = [...checksum].findIndex((char) => /[a-fA-F]/.test(char));
  const swapped = checksum.slice(0, position) + (checksum[position] === checksum[position].toLowerCase()
    ? checksum[position].toUpperCase() : checksum[position].toLowerCase()) + checksum.slice(position + 1);
  assert.equal(normalizePolygonAddress("0x" + swapped), null);
  assert.equal(normalizePolygonAddress(recipient), recipient);
  assert.throws(() => buildPolygonUSDTUnsigned({ to: recipient, amount: 0n, quote }), /invalid_transfer/);
});

test("transferencia USDT firma EIP1559 al contrato y conserva monto y destinatario sin mover POL", () => {
  const result = transfer(5_000_000n);
  const tx = parseTransaction(result.unsigned);
  assert.equal(tx.chainId, 137);
  assert.equal(tx.to?.toLowerCase(), POLYGON_USDT_ADDRESS.toLowerCase());
  assert.equal(tx.value ?? 0n, 0n);
  assert.equal(tx.type, "eip1559");
  const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  assert.equal(decoded.functionName, "transfer");
  assert.equal(decoded.args[0].toLowerCase(), recipient.toLowerCase());
  assert.equal(decoded.args[1], 5_000_000n);
  assert.equal(maxPolygonGas(quote), 85_000n * 70_000_000_000n);
});

test("firma aceptada pertenece a la wallet y rechaza otra wallet o red", async () => {
  const result = transfer();
  const signed = await owner.signTransaction(result.tx);
  assert.equal(await verifyPolygonUSDTSigned(signed, { from: owner.address, unsigned: result.unsigned }), signed);
  await assert.rejects(verifyPolygonUSDTSigned(await other.signTransaction(result.tx), {
    from: owner.address, unsigned: result.unsigned,
  }), /wrong_signer/);
  await assert.rejects(verifyPolygonUSDTSigned(await owner.signTransaction({ ...result.tx, chainId: 8453 }), {
    from: owner.address, unsigned: result.unsigned,
  }), /wrong_chain/);
});

test("verificación rechaza cualquier cambio en destino, monto, gas, nonce, POL o comisiones", async () => {
  const result = transfer();
  const variants = [
    [{ ...result.tx, to: recipient }, /signed_changed_to/],
    [transfer(8_500_000n).tx, /signed_changed_data/],
    [{ ...result.tx, nonce: quote.nonce + 1 }, /signed_changed_nonce/],
    [{ ...result.tx, gas: 86_000n }, /signed_changed_gas/],
    [{ ...result.tx, value: 1n }, /signed_changed_value/],
    [{ ...result.tx, maxFeePerGas: 71_000_000_000n }, /signed_changed_maxFeePerGas/],
    [{ ...result.tx, maxPriorityFeePerGas: 31_000_000_000n }, /signed_changed_maxPriorityFeePerGas/],
  ];
  for (const [changed, reason] of variants) {
    await assert.rejects(verifyPolygonUSDTSigned(await owner.signTransaction(changed), {
      from: owner.address, unsigned: result.unsigned,
    }), reason);
  }
});

test("logs USDT decodifican evento ERC20 real con remitente, destinatario y monto exactos", () => {
  assert.equal(ERC20_TRANSFER_TOPIC, keccak256(toHex("Transfer(address,address,uint256)")));
  const decoded = decodePolygonUsdtTransfer(validLog(), POLYGON_USDT_ADDRESS);
  assert.deepEqual(decoded, { from: owner.address.toLowerCase(), to: recipient.toLowerCase(), value: 10_000_000n });
});

test("logs rechazan contratos ajenos, eventos retirados y topics o datos alterados", () => {
  const normal = validLog();
  const variants = [
    { ...normal, address: recipient },
    { ...normal, removed: true },
    { ...normal, topics: ["0x" + "0".repeat(64), ...normal.topics.slice(1)] },
    { ...normal, topics: normal.topics.slice(0, 2) },
    { ...normal, topics: [...normal.topics, normal.topics[1]] },
    { ...normal, topics: [normal.topics[0], "0x" + "f".repeat(64), normal.topics[2]] },
    { ...normal, data: "0x1234" },
    { ...normal, data: "0x" + "z".repeat(64) },
  ];
  for (const malformed of variants) assert.equal(decodePolygonUsdtTransfer(malformed, POLYGON_USDT_ADDRESS), null);
});
