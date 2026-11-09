import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import { ethers } from "ethers";
import { compileVanDeFiToken } from "../scripts/compile.mjs";

const artifact = compileVanDeFiToken();

function testChain() {
  const eip1193 = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 80002, hardfork: "shanghai" },
    wallet: { totalAccounts: 4, defaultBalance: 100 },
  });
  return new ethers.BrowserProvider(eip1193);
}

async function createToken(supply = 1000n) {
  const provider = testChain();
  const deployer = await provider.getSigner(0);
  const treasury = await provider.getSigner(1);
  const recipient = await provider.getSigner(2);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const token = await factory.deploy(await treasury.getAddress(), supply);
  await token.waitForDeployment();
  return { token, treasury, recipient, factory };
}

test("compila con Solidity + OpenZeppelin y expone solo ERC-20 estándar", () => {
  assert.match(artifact.compiler, /^0\.8\./);
  assert.ok(artifact.bytecode.startsWith("0x"));
  assert.ok(artifact.bytecode.length > 1000);
  const functions = artifact.abi.filter((item) => item.type === "function").map((item) => item.name);
  assert.ok(functions.includes("transfer"));
  assert.ok(functions.includes("approve"));
  assert.ok(functions.includes("balanceOf"));
  assert.ok(!functions.includes("mint"));
  assert.ok(!functions.includes("setTax"));
  assert.ok(!functions.includes("blacklist"));
  assert.ok(!functions.includes("pause"));
  assert.ok(!functions.includes("upgradeTo"));
  assert.ok(!functions.includes("owner"));
});

test("crea VanDeFi VDFI con 18 decimales y emisión fija en la tesorería", async () => {
  const { token, treasury } = await createToken();
  const supply = ethers.parseUnits("1000", 18);
  assert.equal(await token.name(), "VanDeFi");
  assert.equal(await token.symbol(), "VDFI");
  assert.equal(await token.decimals(), 18n);
  assert.equal(await token.initialTreasury(), await treasury.getAddress());
  assert.equal(await token.totalSupply(), supply);
  assert.equal(await token.balanceOf(await treasury.getAddress()), supply);
});

test("permite transferir VDFI entre wallets y no altera la emisión", async () => {
  const { token, treasury, recipient } = await createToken();
  const before = await token.totalSupply();
  const value = ethers.parseUnits("25", 18);
  const tx = await token.connect(treasury).transfer(await recipient.getAddress(), value);
  await tx.wait();
  assert.equal(await token.balanceOf(await recipient.getAddress()), value);
  assert.equal(await token.balanceOf(await treasury.getAddress()), before - value);
  assert.equal(await token.totalSupply(), before);
});

test("nadie puede gastar los tokens ajenos sin allowance", async () => {
  const { token, treasury, recipient } = await createToken();
  await assert.rejects(
    token.connect(recipient).transferFrom(
      await treasury.getAddress(),
      await recipient.getAddress(),
      ethers.parseUnits("1", 18),
    ),
  );
});

test("prohíbe desplegar sin tesorería o con emisión cero", async () => {
  const { factory } = await createToken();
  await assert.rejects(factory.deploy(ethers.ZeroAddress, 1000n));
  const recipient = (await testChain().getSigner(1)).address;
  await assert.rejects(factory.deploy(recipient, 0n));
});

test("no existe un permiso administrativo de emitir o congelar más tokens", async () => {
  const { token } = await createToken();
  assert.equal(typeof token.interface.getFunction("mint", true), "object");
  assert.equal(token.interface.getFunction("mint"), null);
  assert.equal(token.interface.getFunction("pause"), null);
  assert.equal(token.interface.getFunction("transferOwnership"), null);
});
