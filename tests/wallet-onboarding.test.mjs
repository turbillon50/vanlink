import test from "node:test";
import assert from "node:assert/strict";
import { enrollWalletIfMissing } from "../lib/wallet/onboarding.ts";

const wallet = {
  organizationId: "org_existing",
  turnkeyUserId: "usr_1",
  walletId: "wallet_1",
  evmAddress: "0x1234",
  bitcoinAddress: "bc1test",
};
const devicePublicKey = "02" + "a".repeat(64);

test("si el usuario ya tiene wallet, nunca crea otra ni cambia el dispositivo", async () => {
  let prepares = 0, provisions = 0;
  const result = await enrollWalletIfMissing({
    lookup: async () => ({ wallet, canActivate: true }),
    prepareDevice: async () => { prepares++; return devicePublicKey; },
    provision: async () => { provisions++; },
  });
  assert.deepEqual(result, { state: "existing", wallet });
  assert.equal(prepares, 0);
  assert.equal(provisions, 0);
});

test("nuevo registro crea la wallet una vez y confirma direcciones persistidas", async () => {
  let reads = 0, prepares = 0, provisions = 0;
  const result = await enrollWalletIfMissing({
    lookup: async () => (++reads === 1 ? { wallet: null, canActivate: true } : { wallet, canActivate: true }),
    prepareDevice: async () => { prepares++; return devicePublicKey; },
    provision: async (publicKey) => {
      assert.equal(publicKey, devicePublicKey);
      provisions++;
    },
  });
  assert.equal(result.state, "created");
  assert.equal(reads, 2);
  assert.equal(prepares, 1);
  assert.equal(provisions, 1);
});

test("servicio deshabilitado nunca genera llaves ni llama al API", async () => {
  let changes = 0;
  await assert.rejects(enrollWalletIfMissing({
    lookup: async () => ({ wallet: null, canActivate: false }),
    prepareDevice: async () => { changes++; return devicePublicKey; },
    provision: async () => { changes++; },
  }), /wallet_not_available/);
  assert.equal(changes, 0);
});

test("rechaza llave malformada antes de pedir la creación", async () => {
  let provisions = 0;
  await assert.rejects(enrollWalletIfMissing({
    lookup: async () => ({ wallet: null, canActivate: true }),
    prepareDevice: async () => "invalid",
    provision: async () => { provisions++; },
  }), /wallet_device_invalid/);
  assert.equal(provisions, 0);
});

test("el HTTP de creación no basta si falta el registro persistido", async () => {
  await assert.rejects(enrollWalletIfMissing({
    lookup: async () => ({ wallet: null, canActivate: true }),
    prepareDevice: async () => devicePublicKey,
    provision: async () => {},
  }), /wallet_not_confirmed/);
});

test("exige ambas direcciones Bitcoin y EVM antes de declarar éxito", async () => {
  await assert.rejects(enrollWalletIfMissing({
    lookup: async () => {
      const calls = (globalThis.__test_read_count ?? 0) + 1;
      globalThis.__test_read_count = calls;
      return calls > 1 ? { wallet: { ...wallet, bitcoinAddress: "" }, canActivate: true } : { wallet: null, canActivate: true };
    },
    prepareDevice: async () => devicePublicKey,
    provision: async () => {},
  }), /wallet_accounts_missing/);
  delete globalThis.__test_read_count;
});

test("si Turnkey falla, nunca declara una wallet creada", async () => {
  await assert.rejects(enrollWalletIfMissing({
    lookup: async () => ({ wallet: null, canActivate: true }),
    prepareDevice: async () => devicePublicKey,
    provision: async () => { throw new Error("turnkey_unavailable"); },
  }), /turnkey_unavailable/);
});
