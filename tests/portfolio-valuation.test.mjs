import test from "node:test";
import assert from "node:assert/strict";
import { valueWallet } from "../lib/wallet/portfolio-valuation.ts";

function wallet({
  usdc = "0", usdt = "0", cbbtc = "0", eth = "0", btc = "0", pending = "0",
} = {}) {
  return {
    wallet: { evmAddress: "0xabc", bitcoinAddress: "bc1abc" },
    base: { network: "Base", balances: [
      { token: "USDC", amount: usdc },
      { token: "USDT", amount: usdt },
      { token: "cbBTC", amount: cbbtc },
      { token: "ETH", amount: eth },
    ] },
    bitcoin: { token: "BTC", amount: btc, pending },
  };
}

const quote = (btc = 40_000, eth = 2_000) => ({
  quotes: [{ symbol: "BTC", price: btc }, { symbol: "ETH", price: eth }],
  source: "Coinbase Exchange",
  asOf: "2026-11-09T10:00:00Z",
});

test("consolida BTC nativo aunque USDC, USDT, cbBTC y ETH sean cero", () => {
  const result = valueWallet(wallet({ btc: "0.000019" }), quote());
  assert.equal(result.totalUsdc, 0.76);
  assert.equal(result.totalUsd, 0.76);
  assert.equal(result.totalBtc, 0.000019);
});

test("incluye cada activo una sola vez: 0.5 USDC + 0.2 USDT + BTC", () => {
  const result = valueWallet(wallet({ usdc: "0.5", usdt: "0.2", btc: "0.00001" }), quote(80_000));
  assert.ok(Math.abs(result.totalUsdc - 1.5) < 1e-12);
  assert.equal(result.missingBalances.length, 0);
});

test("incluye ETH y cbBTC usando referencias BTC/ETH de mercado", () => {
  const result = valueWallet(wallet({ cbbtc: "0.01", eth: "0.1" }), quote(50_000, 3_000));
  assert.equal(result.totalUsd, 800);
  assert.equal(result.totalUsdc, 800);
  assert.equal(result.estimatedCbbtcPeg, true);
});

test("falla una red y nunca presenta un cero o total parcial como real", () => {
  const broken = wallet({ btc: "0.01" });
  broken.bitcoin = { token: "BTC", error: "no_disponible" };
  const result = valueWallet(broken, quote());
  assert.equal(result.totalUsdc, null);
  assert.deepEqual(result.missingBalances, ["BTC"]);
});

test("falta precio de un BTC positivo: el total no se muestra", () => {
  const result = valueWallet(wallet({ btc: "0.01" }), null);
  assert.equal(result.totalUsd, null);
  assert.deepEqual(result.missingPrices, ["BTC"]);
});

test("si sólo hay stablecoins, funciona con referencia 1:1 advertida", () => {
  const result = valueWallet(wallet({ usdc: "4", usdt: "6" }), null);
  assert.equal(result.totalUsdc, 10);
  assert.equal(result.totalUsd, 10);
  assert.equal(result.totalBtc, null);
  assert.equal(result.estimatedStablecoinPeg, true);
});

test("la cotización USDC/USDT permite expresar el total en USDC", () => {
  const market = {
    quotes: [
      { symbol: "BTC", price: 40_000 },
      { symbol: "ETH", price: 2_000 },
      { symbol: "USDC", price: 1.005 },
    ],
  };
  const result = valueWallet(wallet({ usdc: "1", usdt: "1" }), market);
  assert.ok(Math.abs(result.totalUsdc - (2.005 / 1.005)) < 1e-12);
  assert.ok(Math.abs(result.totalUsd - 2.005) < 1e-12);
  assert.equal(result.estimatedStablecoinPeg, false);
});

test("BTC sin confirmar nunca se incluye en el disponible", () => {
  const result = valueWallet(wallet({ pending: "0.5" }), quote());
  assert.equal(result.totalUsdc, 0);
  assert.equal(result.totalUsd, 0);
});

test("saldo numérico inválido no se convierte en cero", () => {
  const result = valueWallet(wallet({ eth: "sin lectura" }), quote());
  assert.equal(result.totalUsdc, null);
  assert.deepEqual(result.missingBalances, ["ETH"]);
});
