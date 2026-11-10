import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";

test("a durable attempt retains its key, capacity and receipt across retries", async t => {
  const pg = new PGlite();
  t.after(() => pg.close());
  const migration = readFileSync(new URL("../db/migrations/20261110_wallet_provisioning.sql", import.meta.url), "utf8");
  await pg.exec(migration);
  await pg.exec(migration);
  const db = drizzle(pg);
  const source = readFileSync(new URL("../lib/wallet/provision-intent.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const modules = { "server-only": {}, "drizzle-orm": { sql }, "@/lib/db": { db: () => db } };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(Object.hasOwn(modules, name));
    return modules[name];
  } });
  const { reserveIntent, recordOrganization } = exports;
  const key = "02" + "ab".repeat(32);
  const secondKey = "03" + "cd".repeat(32);
  await assert.rejects(reserveIntent("owner", "parent", key), /budget unavailable/);
  await pg.exec("INSERT INTO wallet_provision_budget VALUES ('parent', 1)");
  const first = await reserveIntent("owner", "parent", key);
  const retry = await reserveIntent("owner", "parent", secondKey);
  assert.equal(first.dispatch, true);
  assert.equal(retry.dispatch, false);
  assert.equal(first.intent.attempt_id, retry.intent.attempt_id);
  assert.equal(retry.intent.public_key, key);
  await assert.rejects(reserveIntent("second-owner", "parent", secondKey), /budget exhausted/);
  await recordOrganization(first.intent.attempt_id, "existing-org");
  await recordOrganization(first.intent.attempt_id, "existing-org");
  await assert.rejects(recordOrganization(first.intent.attempt_id, "wrong-org"), /conflict/);
  await assert.rejects(reserveIntent("owner", "other-parent", key), /environment mismatch/);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM wallet_provision_intents")).rows[0].n, 1);
});
