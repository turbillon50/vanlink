import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { panelPath, resumePath } from "../lib/navigation/module-one.ts";

test("resume preserves a local link origin through Clerk and rejects foreign destinations", () => {
  const expected = panelPath("crear", "/l/recibo?via=mensaje");
  assert.equal(resumePath(expected), expected);
  assert.equal(resumePath("https://outside.example"), null);
  assert.equal(resumePath("/login"), null);
  assert.equal(resumePath("/?panel=desconocido"), null);
  assert.equal(resumePath("/?panel=crear&origen=%2F%2Foutside.example"), panelPath("crear", "/"));
});

test("session, webhook and redelivery produce a single account without creating a wallet", async t => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(readFileSync(new URL("../db/migrations/20261110_module_one_identity.sql", import.meta.url), "utf8"));
  const database = drizzle(pg);
  const modules = { "server-only": {}, "drizzle-orm": { sql }, "@/lib/db": { db: () => database } };
  const source = readFileSync(new URL("../lib/db/account.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => modules[name] });
  await Promise.all(Array.from({ length: 5 }, () => exports.ensureAccount("user_module_one")));
  assert.equal((await pg.query("SELECT clerk_user_id FROM vandefi_accounts")).rows.length, 1);
});
