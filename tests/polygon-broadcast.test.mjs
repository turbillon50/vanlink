import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as viem from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POLYGON_CHAIN_ID, POLYGON_EXPLORER, POLYGON_USDT_ADDRESS } from "../lib/polygon/asset.ts";
import { buildPolygonUSDTUnsigned } from "../lib/send/polygon-tx.ts";

const routeSource = readFileSync(new URL("../app/api/send/polygon/broadcast/route.ts", import.meta.url), "utf8");
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const owner = privateKeyToAccount("0x" + "11".repeat(32));
const stranger = privateKeyToAccount("0x" + "22".repeat(32));
const recipient = "0x1111111111111111111111111111111111111111";
const quote = {
  nonce: 3, gas: "85000", maxFeePerGas: "70000000000", maxPriorityFeePerGas: "30000000000",
  usdtBalance: "20000000", polBalance: "1000000000000000000", issuedAt: Date.now(),
};
const transaction = buildPolygonUSDTUnsigned({ to: recipient, amount: 10_000_000n, quote }).tx;
const signed = await owner.signTransaction(transaction);
const expectedHash = viem.keccak256(signed);

function isolatedRoute(options = {}) {
  const order = [];
  const journal = [];
  const rpcCalls = [];
  class SendError extends Error {
    constructor(code, status = 400, message = code) { super(message); this.code = code; this.status = status; }
  }
  const imports = {
    viem,
    "@/lib/polygon/asset": { POLYGON_CHAIN_ID, POLYGON_EXPLORER, POLYGON_USDT_ADDRESS },
    "@/lib/polygon/capabilities": { polygonUsdtMoneyEnabled: () => options.enabled !== false },
    "@/lib/send/server": {
      SendError, noStore: { "Cache-Control": "no-store" },
      currentWallet: async () => ({ clerkUserId: "user_test1234", evmAddress: owner.address }),
      errorResponse: (error) => Response.json({ code: error.code }, { status: error.status || 500 }),
    },
    "@/lib/operations/server": {
      rememberPolygonOperation: async (operation) => {
        order.push("journal");
        if (options.journalError) throw new Error("database unavailable");
        journal.push(operation);
      },
    },
    "@/lib/chain/polygon": {
      polygonRpc: async (method, params) => {
        order.push(method); rpcCalls.push({ method, params });
        return options.rpc ? options.rpc(method, params) : expectedHash;
      },
    },
  };
  const exports = {};
  vm.runInNewContext(compiledRoute, {
    exports, Response,
    require: (name) => {
      assert.ok(Object.hasOwn(imports, name), "unexpected real dependency: " + name);
      return imports[name];
    },
  }, { filename: "isolated-polygon-broadcast.cjs", timeout: 5000 });
  return {
    order, journal, rpcCalls,
    post: (signature = signed) => exports.POST(new Request("https://example.test/api/send/polygon/broadcast", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signed: signature }),
    })),
  };
}

test("Polygon deshabilitado no guarda ni transmite aunque reciba firma válida", async () => {
  const route = isolatedRoute({ enabled: false });
  const response = await route.post();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "polygon_no_habilitado");
  assert.equal(route.order.length, 0);
});

test("sin registro durable no se transmite la operación firmada", async () => {
  const route = isolatedRoute({ journalError: true });
  const response = await route.post();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "historial_no_disponible");
  assert.deepEqual(route.order, ["journal"]);
  assert.equal(route.rpcCalls.length, 0);
});

test("guarda hash, dueño, destinatario y monto antes de transmitir; confirma solo mismo hash", async () => {
  const route = isolatedRoute();
  const response = await route.post();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.hash, expectedHash);
  assert.equal(body.broadcastUncertain, false);
  assert.equal(body.explorer, POLYGON_EXPLORER + "/tx/" + expectedHash);
  assert.deepEqual(route.order, ["journal", "eth_sendRawTransaction"]);
  assert.equal(route.journal[0].hash, expectedHash);
  assert.equal(route.journal[0].clerkUserId, "user_test1234");
  assert.equal(route.journal[0].walletAddress, owner.address);
  assert.equal(route.journal[0].recipient, recipient);
  assert.equal(route.journal[0].amountRaw, "10000000");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("timeout después de registrar conserva mismo hash y devuelve incertidumbre 202", async () => {
  const route = isolatedRoute({ rpc: () => { throw new Error("rpc_timeout"); } });
  const response = await route.post();
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.hash, expectedHash);
  assert.equal(body.broadcastUncertain, true);
  assert.equal(route.journal.length, 1);
});

test("respuesta RPC con otro hash no se convierte en envío exitoso", async () => {
  const route = isolatedRoute({ rpc: () => "0x" + "f".repeat(64) });
  const response = await route.post();
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.hash, expectedHash);
  assert.equal(body.broadcastUncertain, true);
});

test("nonce usado no prueba este envío: consulta hash exacto antes de declarar transmitido", async () => {
  for (const known of [null, { hash: "0x" + "f".repeat(64) }, { hash: expectedHash }]) {
    const route = isolatedRoute({ rpc: (method, params) => {
      if (method === "eth_sendRawTransaction") throw new Error("polygon_nonce_too_low");
      assert.equal(method, "eth_getTransactionByHash");
      assert.equal(params[0], expectedHash);
      return known;
    } });
    const response = await route.post();
    const body = await response.json();
    const sameHash = known?.hash === expectedHash;
    assert.equal(response.status, sameHash ? 200 : 202);
    assert.equal(body.broadcastUncertain, !sameHash);
    assert.equal(body.hash, expectedHash);
    assert.equal(route.journal.length, 1);
  }
});

test("firma ajena, otra red, contrato o transferencia POL se rechazan antes de persistir", async () => {
  const signatures = [
    [await stranger.signTransaction(transaction), 403, "tx_ajena"],
    [await owner.signTransaction({ ...transaction, chainId: 8453 }), 400, "red_incorrecta"],
    [await owner.signTransaction({ ...transaction, to: recipient }), 400, "contrato_incorrecto"],
    [await owner.signTransaction({ ...transaction, value: 1n }), 400, "valor_nativo_no_permitido"],
  ];
  for (const [signature, status, code] of signatures) {
    const route = isolatedRoute();
    const response = await route.post(signature);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    assert.equal(route.order.length, 0);
  }
});

test("falta de POL no se reporta como transmisión exitosa", async () => {
  const route = isolatedRoute({ rpc: () => { throw new Error("polygon_insufficient_funds"); } });
  const response = await route.post();
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "sin_pol");
  assert.equal(route.journal.length, 1);
});
