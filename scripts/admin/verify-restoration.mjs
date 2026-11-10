#!/usr/bin/env node
/** Read-only verification of an isolated restore; never performs a restore. */
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { readPrivateFile } from './bootstrap.mjs';

const tables = ['user_wallets','vanlinks','wallet_operations'];
export async function fingerprints(client) {
  const result = {};
  for (const table of tables) {
    const count = (await client.query(`SELECT count(*)::text AS count FROM ${table}`)).rows[0]?.count;
    if (!/^\d+$/.test(count || '') || BigInt(count) > 100000n) throw new Error('verification_scope_exceeded');
    // Fixed identifiers only. All output is an aggregate; customer rows never leave PG.
    const query = `SELECT count(*)::text AS count, md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS fingerprint FROM (SELECT md5(row_to_json(t)::text) AS h FROM ${table} t) s`;
    result[table] = (await client.query(query)).rows[0];
  }
  const schema = (await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY tablename,indexname",[tables])).rows;
  const constraints = (await client.query("SELECT conrelid::regclass::text AS relation,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('user_wallets'::regclass,'vanlinks'::regclass,'wallet_operations'::regclass) ORDER BY relation,conname")).rows;
  return {tables:result,indexes:schema,constraints};
}
export function compareFingerprints(expected,actual) {
  return tables.every(table => expected?.tables?.[table]?.count === actual.tables[table].count && expected.tables[table].fingerprint === actual.tables[table].fingerprint) &&
    JSON.stringify(expected.indexes) === JSON.stringify(actual.indexes) && JSON.stringify(expected.constraints) === JSON.stringify(actual.constraints);
}

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write('Read-only isolated restore verification.\n--database-url-file <private-file> --baseline-file <private-json-file> [--capture]\nRequire ADMIN_NEON_BRANCH_ID, ADMIN_DATABASE_HOST; command_environment must match preview/test and a nonproduction branch. Maximum 100000 rows per table. --capture writes a new private baseline file, never overwrites. No customer rows are emitted. This script does not restore a backup.\n');
    return;
  }
  const args=process.argv.slice(2),flags={};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--capture') { if(flags.capture) throw new Error('flags'); flags.capture=true; }
    else if(['--database-url-file','--baseline-file'].includes(args[i]) && args[i+1] && !args[i+1].startsWith('--')) { if(flags[args[i]]) throw new Error('flags'); flags[args[i]]=args[++i]; }
    else throw new Error('flags');
  }
  if(!flags['--database-url-file'] || !flags['--baseline-file'] || process.env.VERCEL_ENV==='production') throw new Error('flags');
  const connectionString=(await readPrivateFile(flags['--database-url-file'])).trim();
  const branch=process.env.ADMIN_NEON_BRANCH_ID,host=process.env.ADMIN_DATABASE_HOST;
  const url=new URL(connectionString);
  if(!branch || branch==='br-small-feather-bc9qqmom' || !host || url.hostname!==host || url.hostname.includes('-pooler.')) throw new Error('branch');
  const client=new pg.Client({connectionString,connectionTimeoutMillis:8000,statement_timeout:10000});
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL search_path = pg_catalog, public');
    const marker=(await client.query('SELECT environment,neon_branch_id FROM command_environment WHERE singleton=true')).rows;
    if(marker.length!==1 || !['preview','test'].includes(marker[0].environment) || marker[0].neon_branch_id!==branch) throw new Error('marker');
    const actual=await fingerprints(client);
    await client.query('COMMIT');
    if(flags.capture) {
      await writeFile(flags['--baseline-file'],JSON.stringify({version:1,capturedAt:new Date().toISOString(),...actual},null,2)+'\n',{mode:0o600,flag:'wx'});
      process.stdout.write(JSON.stringify({result:'private_baseline_captured',tables:tables.length})+'\n');
    } else {
      const expected=JSON.parse(await readPrivateFile(flags['--baseline-file'],65536));
      if(expected.version!==1 || !compareFingerprints(expected,actual)) throw new Error('mismatch');
      process.stdout.write(JSON.stringify({result:'restored_legacy_data_and_schema_match',tables:tables.length,branchId:branch})+'\n');
    }
  } finally { await client.end().catch(()=>{}); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(()=>{process.stderr.write('{"error":"restore_verification_failed"}\n');process.exitCode=1;});
