import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";

function load(path, modules, env = {}) {
  const exports = {};
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, process: { env }, URL, Response, require: name => { assert.ok(Object.hasOwn(modules,name)); return modules[name]; } });
  return exports;
}

test("verified session, signed webhook and replay converge; guest and invalid signature cannot create an account", async t => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(readFileSync(new URL("../db/migrations/20261110_module_one_identity.sql", import.meta.url), "utf8"));
  const database = drizzle(pg);
  const accounts = load("lib/db/account.ts", { "server-only": {}, "drizzle-orm": { sql }, "@/lib/db": { db: () => database } });
  let principal = null;
  const session = load("app/api/account/session/route.ts", { "@clerk/nextjs/server": { auth: async () => ({userId:principal}) }, "@/lib/db/account": accounts });
  const key = Buffer.from("module-one-test-signature-only");
  const secret = "whsec_" + key.toString("base64");
  const webhook = load("app/api/webhooks/clerk/route.ts", { "@clerk/nextjs/webhooks": { verifyWebhook: req => verifyWebhook(req, { signingSecret: secret }) }, "@/lib/db/account": accounts }, { CLERK_WEBHOOK_SIGNING_SECRET: secret });
  const origin = "https://module-one.example";
  const local = () => new Request(origin + "/api/account/session", { method: "POST", headers: {origin} });
  function event(valid) {
    const id = "msg_module_one", timestamp = String(Math.floor(Date.now()/1000));
    const body = JSON.stringify({ object:"event", type:"user.created", data:{id:"user_fixture"} });
    const signature = createHmac("sha256",key).update(id+"."+timestamp+"."+body).digest("base64");
    return new Request(origin + "/api/webhooks/clerk", { method:"POST", body, headers: { "content-type":"application/json","svix-id":id,"svix-timestamp":timestamp,"svix-signature":"v1," + (valid ? signature : "invalid") } });
  }
  assert.equal((await session.POST(local())).status,401);
  assert.equal((await webhook.POST(event(false))).status,400);
  principal = "user_fixture";
  const [account, delivery, retry] = await Promise.all([session.POST(local()), webhook.POST(event(true)), webhook.POST(event(true))]);
  assert.equal(account.status,200);
  assert.equal(delivery.status,204);
  assert.equal(retry.status,204);
  assert.deepEqual((await pg.query("SELECT clerk_user_id FROM vandefi_accounts")).rows,[{clerk_user_id:"user_fixture"}]);
});
