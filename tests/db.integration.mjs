import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

// Always rolls back; run explicitly against a development/empty release DB.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new Client({ connectionString: process.env.DATABASE_URL });
const id = `verification_${randomUUID()}`;
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("INSERT INTO user_wallets (clerk_user_id,organization_id,wallet_id,turnkey_user_id,evm_address,bitcoin_address) VALUES ($1,$2,$3,$4,$5,$6)", [id,id,id,id,id,id]);
  await client.query("SAVEPOINT uniqueness");
  await assert.rejects(client.query("INSERT INTO user_wallets (clerk_user_id,organization_id,wallet_id,turnkey_user_id,evm_address,bitcoin_address) VALUES ($1,$2,$3,$4,$5,$6)", [id+"other",id,id+"other",id,id+"other",id+"other"]), e => e.code === "23505");
  await client.query("ROLLBACK TO SAVEPOINT uniqueness");
  await client.query("INSERT INTO wallet_oauth_flows (clerk_user_id,state_hash,public_key,verifier,expires_at) VALUES ($1,$2,$3,$4,now()+interval '5 minutes')", [id,id,id,id]);
  const consume = owner => client.query("DELETE FROM wallet_oauth_flows WHERE clerk_user_id=$1 AND state_hash=$2 AND expires_at>now() RETURNING state_hash", [owner,id]);
  assert.equal((await consume(id+"other")).rowCount,0);
  assert.equal((await consume(id)).rowCount,1);
  assert.equal((await consume(id)).rowCount,0);
  await client.query("INSERT INTO wallet_oauth_flows (clerk_user_id,state_hash,public_key,verifier,expires_at) VALUES ($1,$2,$3,$4,now()-interval '1 minute')", [id,id,id,id]);
  assert.equal((await consume(id)).rowCount,0);
  console.log("Database verification passed: ownership uniqueness, cross-user rejection, one-time consumption and expiry.");
} catch (error) {
  console.error("Database verification failed", { name: error.name, code: error.code || "unknown" });
  process.exitCode=1;
} finally {
  await client.query("ROLLBACK").catch(()=>{});
  await client.end();
}
