import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const model = readFileSync(new URL("../db/prototypes/platform-model.sql", import.meta.url), "utf8");

test("platform design with synthetic brands, contracts and holders", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(model);
  await db.exec(`
    INSERT INTO vd_model.security_domain VALUES ('shared','platform'), ('dedicated','independent');
    INSERT INTO vd_model.brand (brand_id,operating_model,parent_org_id)
      VALUES ('native','first_party','shared'), ('a','managed','shared'), ('b','managed','shared'),
             ('ind','independent','dedicated');
    INSERT INTO vd_model.holder VALUES ('client','person'), ('owner','person'), ('partner','person'),
      ('other','person'), ('support','person'), ('merchant','merchant'), ('platform','platform');
    INSERT INTO vd_model.login_identity VALUES ('live','admin','owner'),
      ('live','partner','partner'), ('other-issuer','partner','other'), ('live','support','support');
    INSERT INTO vd_model.customer VALUES ('a','client'), ('b','client'), ('b','merchant'), ('ind','client');
    INSERT INTO vd_model.security_space VALUES ('personal','shared','client'), ('shop','shared','merchant'),
      ('platform-space','shared','platform');
    INSERT INTO vd_model.wallet VALUES ('w1','personal','personal'),('w2','shop','treasury'),
      ('w3','platform-space','treasury'),('w4','shop','treasury');
    INSERT INTO vd_model.membership VALUES ('a','owner','brand_admin'), ('a','partner','associate'),
      ('a','other','associate'), ('b','other','associate'), ('a','support','support');
    INSERT INTO vd_model.origination (brand_id,contract_ref,customer_holder_id,associate_holder_id)
      VALUES ('a','a1','client','partner'), ('a','a2','client','other'), ('b','b1','merchant','other');
    CREATE ROLE report_reader;
    GRANT USAGE ON SCHEMA vd_model TO report_reader;
    GRANT SELECT ON vd_model.visible_contracts TO report_reader;
  `);

  await t.test("two managed brands resolve the same holder and wallet; an independent domain has no implicit wallet", async () => {
    const { rows } = await db.query(`
      SELECT b.brand_id, w.wallet_id FROM vd_model.customer c
      JOIN vd_model.brand b USING (brand_id)
      LEFT JOIN vd_model.security_space s ON s.holder_id = c.holder_id AND s.parent_org_id = b.parent_org_id
      LEFT JOIN vd_model.wallet w USING (sub_org_id)
      WHERE c.holder_id = 'client' ORDER BY b.brand_id`);
    assert.deepEqual(rows, [
      { brand_id: "a", wallet_id: "w1" },
      { brand_id: "b", wallet_id: "w1" },
      { brand_id: "ind", wallet_id: null },
    ]);
    await assert.rejects(db.exec("INSERT INTO vd_model.security_space VALUES ('duplicate','shared','client')"), { code: "23505" });
    await assert.rejects(db.exec("INSERT INTO vd_model.brand (brand_id,operating_model,parent_org_id) VALUES ('x','managed','dedicated')"), { code: "23503" });
    await assert.rejects(db.exec("INSERT INTO vd_model.brand (brand_id,operating_model,parent_org_id) VALUES ('x','independent','dedicated')"), { code: "23505" });
  });

  await t.test("the merchant and platform treasuries have separate holders and wallet sets", async () => {
    const { rows } = await db.query(`
      SELECT s.holder_id, w.wallet_id FROM vd_model.wallet w
      JOIN vd_model.security_space s USING (sub_org_id)
      WHERE w.purpose = 'treasury' ORDER BY s.holder_id, w.wallet_id`);
    assert.deepEqual(rows, [
      { holder_id: "merchant", wallet_id: "w2" },
      { holder_id: "merchant", wallet_id: "w4" },
      { holder_id: "platform", wallet_id: "w3" },
    ]);
  });

  await t.test("contract attribution requires a customer and an associate from the same brand", async () => {
    const insert = "INSERT INTO vd_model.origination (brand_id,contract_ref,customer_holder_id,associate_holder_id) VALUES ";
    await assert.rejects(db.exec(insert + "('a','bad-client','merchant','partner')"), { code: "23503" });
    await assert.rejects(db.exec(insert + "('b','bad-partner','merchant','partner')"), { code: "23503" });
    await assert.rejects(db.exec(insert + "('a','a1','client','other')"), { code: "23505" });
  });

  await db.exec("SET ROLE report_reader");
  const list = async (issuer, subject, brand) => db.transaction(async tx => {
    await tx.query(`SELECT set_config('vandefi.issuer', $1, true),
                           set_config('vandefi.subject', $2, true),
                           set_config('vandefi.brand', $3, true)`, [issuer, subject, brand]);
    const { rows } = await tx.query("SELECT contract_ref FROM vd_model.visible_contracts ORDER BY contract_ref");
    return rows.map(row => row.contract_ref);
  });

  await t.test("admins, associates and support get only the contract references assigned by the model", async () => {
    assert.deepEqual(await list('live','admin','a'), ['a1','a2']);
    assert.deepEqual(await list('live','admin','b'), []);
    assert.deepEqual(await list('live','partner','a'), ['a1']);
    assert.deepEqual(await list('live','partner','b'), []);
    assert.deepEqual(await list('other-issuer','partner','b'), ['b1']);
    assert.deepEqual(await list('live','support','a'), []);
    assert.deepEqual(await list('live','unknown','a'), []);
    assert.deepEqual((await db.query("SELECT * FROM vd_model.visible_contracts")).rows, []);
  });

  await t.test("the commercial reader cannot read wallet IDs or edit memberships", async () => {
    await assert.rejects(db.query("SELECT wallet_id FROM vd_model.wallet"), { code: "42501" });
    await assert.rejects(db.exec("UPDATE vd_model.membership SET role = 'brand_admin' WHERE holder_id = 'partner'"), { code: "42501" });
  });
});
