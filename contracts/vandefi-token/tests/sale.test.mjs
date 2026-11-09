import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import { ethers } from "ethers";
import { compileVDFISaleSuite } from "../scripts/compile-sale.mjs";

const compiled = compileVDFISaleSuite();
const TOKEN_UNITS = ethers.parseUnits("1", 18);
const USDC_UNITS = ethers.parseUnits("1", 6);

async function sandbox({ inventory = 1000n, cap = 1000n, price = 20000n, step = 2000n } = {}) {
  const ethereum = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 80002, hardfork: "shanghai" },
    wallet: { totalAccounts: 6, defaultBalance: 300 },
  });
  const provider = new ethers.BrowserProvider(ethereum);
  const deployer = await provider.getSigner(0);
  const founder = await provider.getSigner(1);
  const reserveBeneficiary = await provider.getSigner(2);
  const buyer = await provider.getSigner(3);
  const outsider = await provider.getSigner(4);

  const USDCFactory = new ethers.ContractFactory(compiled.testUSDC.abi, compiled.testUSDC.bytecode, deployer);
  const USDC = await USDCFactory.deploy();
  await USDC.waitForDeployment();

  const TokenFactory = new ethers.ContractFactory(compiled.token.abi, compiled.token.bytecode, deployer);
  const token = await TokenFactory.deploy(await founder.getAddress(), inventory + 200n);
  await token.waitForDeployment();

  const SaleFactory = new ethers.ContractFactory(compiled.sale.abi, compiled.sale.bytecode, deployer);
  const sale = await SaleFactory.deploy(
    await token.getAddress(),
    await USDC.getAddress(),
    await founder.getAddress(),
    await reserveBeneficiary.getAddress(),
    price,
    step,
    cap,
  );
  await sale.waitForDeployment();

  const vault = new ethers.Contract(await sale.reserve(), compiled.reserve.abi, provider);

  await (await token.connect(founder).transfer(await sale.getAddress(), inventory * TOKEN_UNITS)).wait();
  await (await USDC.mintForTest(await buyer.getAddress(), 1000n * USDC_UNITS)).wait();
  await (await USDC.connect(buyer).approve(await sale.getAddress(), 1000n * USDC_UNITS)).wait();

  return { ethereum, provider, deployer, founder, reserveBeneficiary, buyer, outsider, token, USDC, sale, vault };
}

async function latestTimestamp(provider) {
  const block = await provider.getBlock("latest");
  return BigInt(block.timestamp);
}

test("la suite compila token, venta, reserva y USDC ficticio", () => {
  assert.ok(compiled.sale.abi.some(x => x.name === "buyWholeTokens"));
  assert.ok(compiled.reserve.abi.some(x => x.name === "release"));
  assert.ok(compiled.token.bytecode.startsWith("0x"));
});

test("cada compra inicial divide 50/50 en USDC y entrega VDFI al comprador", async () => {
  const { founder, reserveBeneficiary, buyer, token, USDC, sale, vault } = await sandbox();
  const quantity = 3n;
  const price = await sale.quoteWholeTokens(quantity);
  assert.equal(price, 66000n); // 0.020 + 0.022 + 0.024 USDC

  const deadline = (await latestTimestamp(sale.runner.provider)) + 3600n;
  await (await sale.connect(buyer).buyWholeTokens(quantity, price, deadline)).wait();

  assert.equal(await token.balanceOf(await buyer.getAddress()), quantity * TOKEN_UNITS);
  assert.equal(await USDC.balanceOf(await founder.getAddress()), 33000n);
  assert.equal(await USDC.balanceOf(await vault.getAddress()), 33000n);
  assert.equal(await USDC.balanceOf(await reserveBeneficiary.getAddress()), 0n);
  assert.equal(await sale.soldWholeTokens(), 3n);
  assert.equal(await sale.totalRaisedMicroUSDC(), 66000n);
  assert.equal(await vault.totalCredited(), 33000n);
  assert.equal(await vault.lockedOutstanding(), 33000n);
});

test("la curva primaria sube según unidades vendidas, pero no es precio de un DEX", async () => {
  const { buyer, sale } = await sandbox();
  assert.equal(await sale.currentPrimaryPriceMicroUSDC(), 20000n);
  const first = await sale.quoteWholeTokens(1n);
  await (await sale.connect(buyer).buyWholeTokens(1n, first, (await latestTimestamp(sale.runner.provider)) + 120n)).wait();
  assert.equal(await sale.currentPrimaryPriceMicroUSDC(), 22000n);
  assert.equal(await sale.quoteWholeTokens(2n), 46000n);
});

test("evita comprar a precio viejo, sin fondos, sin inventario o pasada la fecha límite", async () => {
  const { buyer, sale, token, founder, USDC } = await sandbox({ inventory: 2n, cap: 3n });
  const now = await latestTimestamp(sale.runner.provider);
  await assert.rejects(sale.connect(buyer).buyWholeTokens(1n, 19999n, now + 500n));
  await assert.rejects(sale.connect(buyer).buyWholeTokens(1n, 20000n, now - 1n));
  await assert.rejects(sale.connect(buyer).buyWholeTokens(0n, 20000n, now + 500n));
  await assert.rejects(sale.connect(buyer).buyWholeTokens(4n, 1000000n, now + 500n));
  await assert.rejects(sale.connect(buyer).buyWholeTokens(3n, 1000000n, now + 500n));
  const first = await sale.quoteWholeTokens(1n);
  await (await sale.connect(buyer).buyWholeTokens(1n, first, now + 500n)).wait();
  await (await USDC.connect(buyer).approve(await sale.getAddress(), 0n)).wait();
  const next = await sale.quoteWholeTokens(1n);
  await assert.rejects(sale.connect(buyer).buyWholeTokens(1n, next, now + 500n));
  assert.equal(await token.balanceOf(await buyer.getAddress()), TOKEN_UNITS);
});

test("la caja no permite liberar antes de 365 días ni acreditar sin contrato de venta", async () => {
  const { provider, buyer, outsider, sale, vault, reserveBeneficiary, USDC } = await sandbox();
  const now = await latestTimestamp(provider);
  const price = await sale.quoteWholeTokens(1n);
  await (await sale.connect(buyer).buyWholeTokens(1n, price, now + 500n)).wait();
  await assert.rejects(vault.connect(outsider).credit(1n));
  const credited = await vault.queryFilter(vault.filters.ReserveCredited());
  assert.equal(credited.length, 1);
  const unlockAt = credited[0].args.unlockAt;
  const paidAt = BigInt((await provider.getBlock(credited[0].blockNumber)).timestamp);
  assert.ok(unlockAt - paidAt >= 365n * 86400n);
  assert.ok(unlockAt - paidAt < 366n * 86400n);
  await assert.rejects(vault.connect(outsider).release([unlockAt]));
  await provider.send("evm_increaseTime", [Number(unlockAt - await latestTimestamp(provider) - 1n)]);
  await provider.send("evm_mine", []);
  await assert.rejects(vault.connect(outsider).release([unlockAt]));
  await provider.send("evm_increaseTime", [2]);
  await provider.send("evm_mine", []);

  // Anyone may trigger release, but ONLY the immutable beneficiary receives USDC.
  await (await vault.connect(outsider).release([unlockAt])).wait();
  assert.equal(await USDC.balanceOf(await reserveBeneficiary.getAddress()), 10000n);
  assert.equal(await vault.lockedOutstanding(), 0n);
  assert.equal(await vault.totalReleased(), 10000n);
  await assert.rejects(vault.connect(outsider).release([unlockAt])); // no double release
});

test("no existen funciones para retirar la reserva anticipadamente ni cambiar su beneficiario", async () => {
  const { sale, vault } = await sandbox();
  for (const fn of ["owner", "withdraw", "emergencyWithdraw", "sweep", "changeBeneficiary", "setPrice", "setTax", "mint"]) {
    assert.equal(vault.interface.getFunction(fn), null);
    assert.equal(sale.interface.getFunction(fn), null);
  }
});

test("beneficiario de reserva y fundador son direcciones independientes e inmutables", async () => {
  const { founder, reserveBeneficiary, sale, vault } = await sandbox();
  assert.equal(await sale.founderTreasury(), await founder.getAddress());
  assert.equal(await vault.beneficiary(), await reserveBeneficiary.getAddress());
  assert.notEqual(await vault.beneficiary(), await founder.getAddress());
  assert.equal(await vault.sale(), await sale.getAddress());
});
