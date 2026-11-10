import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFlags, readPrivateFile, validateBootstrap, performBootstrap } from '../scripts/admin/bootstrap.mjs';
import { compareFingerprints, fingerprints } from '../scripts/admin/verify-restoration.mjs';

const now=Date.parse('2026-11-10T01:00:00Z');
const userId='user_synthetic123456789';
const flags={'user-id':userId,environment:'preview',reason:'Identidad autorizada verificada en sesión', 'operator-id':'operator-ticket-123'};
const env={ADMIN_NEON_BRANCH_ID:'br-isolated-test',ADMIN_DATABASE_HOST:'ep-test.example.neon.tech',CLERK_OIDC_ISSUER:'https://clerk.example.test'};
const evidence={schemaVersion:1,method:'authenticated-clerk-session',clerkUserId:userId,authorizedBy:'Luis',environment:'preview',authorizationReference:'private-review/session-check-123',verifiedAt:'2026-11-10T00:55:00Z',issuer:env.CLERK_OIDC_ISSUER};
const connection='postgresql://synthetic:synthetic@ep-test.example.neon.tech/isolated?sslmode=require';
const validate=(f={},e={},n={})=>validateBootstrap({...flags,...f},{...evidence,...e},connection,{...env,...n},now);

test('bootstrap requires exact recently verified subject and isolated preview destination',()=>{
  assert.equal(validate().userId,userId);
  assert.throws(()=>validate({}, {clerkUserId:'user_someoneelse12345'}),/verified_identity_evidence_required/);
  assert.throws(()=>validate({}, {verifiedAt:'2026-11-08T00:55:00Z'}),/identity_evidence_expired/);
  assert.throws(()=>validate({}, {verifiedAt:'2026-11-11T00:55:00Z'}),/identity_evidence_expired/);
  assert.throws(()=>validate({'user-id':'luis@example.test'}),/invalid_clerk_user_id/);
  assert.throws(()=>validate({}, {issuer:'https://other.example.test'}),/clerk_issuer_mismatch/);
  assert.throws(()=>validate({environment:'production'}),/preview_only/);
  assert.throws(()=>validate({}, {},{VERCEL_ENV:'production'}),/preview_only/);
  assert.throws(()=>validate({}, {},{ADMIN_NEON_BRANCH_ID:'br-small-feather-bc9qqmom'}),/isolated_branch_required/);
  assert.throws(()=>validate({}, {},{ADMIN_DATABASE_HOST:'production.example.test'}),/direct_branch_connection_required/);
  assert.throws(()=>validate({'operator-id':userId}),/external_operator_required/);
  assert.throws(()=>validate({}, {sessionToken:'synthetic-do-not-store'}),/unexpected_evidence_fields/);
});

test('bootstrap CLI rejects unknown and repeated flags rather than guessing identities',()=>{
  assert.throws(()=>parseFlags(['--email','someone@example.test']),/invalid_flags/);
  assert.throws(()=>parseFlags(['--user-id',userId,'--user-id',userId]),/invalid_flags/);
  assert.throws(()=>parseFlags(['--user-id',userId]),/missing_/);
});

test('private input reader refuses world-readable files and symlinks',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'vandefi-bootstrap-'));
  try {
    const filename=join(directory,'input');
    await writeFile(filename,'synthetic',{mode:0o600});
    assert.equal(await readPrivateFile(filename),'synthetic');
    await chmod(filename,0o644);
    await assert.rejects(readPrivateFile(filename),/private_file_required/);
    await chmod(filename,0o600);
    const linked=join(directory,'linked');await symlink(filename,linked);
    await assert.rejects(readPrivateFile(linked));
    await assert.rejects(readPrivateFile(filename,2),/private_file_required/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

function fakeClient({count='0',marker={environment:'preview',neon_branch_id:env.ADMIN_NEON_BRANCH_ID},failAudit=false}={}) {
  const calls=[];
  return {calls,query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT environment')) return {rows:marker?[marker]:[]};
    if(sql.startsWith('SELECT count')) return {rows:[{count}]};
    if(sql.startsWith('INSERT INTO command_audit') && failAudit) throw new Error('synthetic_failure');
    return {rows:[]};
  }};
}

test('bootstrap refuses any prior grant and rolls back on marker or audit failure',async()=>{
  const input=validate();
  for(const options of [{count:'1'},{marker:null},{failAudit:true}]) {
    const client=fakeClient(options);
    await assert.rejects(performBootstrap(client,input,'a'.repeat(64)));
    assert.equal(client.calls.at(-1).sql,'ROLLBACK');
    assert.equal(client.calls.some(c=>c.sql==='COMMIT'),false);
  }
});

test('bootstrap writes owner and audit in one transaction and persists only evidence hash',async()=>{
  const client=fakeClient();
  const result=await performBootstrap(client,validate(),'b'.repeat(64));
  const grant=client.calls.find(c=>c.sql.startsWith('INSERT INTO command_role_grants'));
  const audit=client.calls.find(c=>c.sql.startsWith('INSERT INTO command_audit'));
  assert.ok(grant);assert.ok(audit);
  assert.equal(grant.params[1],userId);
  assert.equal(client.calls[0].sql,'BEGIN');
  assert.equal(client.calls.at(-1).sql,'COMMIT');
  assert.equal(JSON.parse(audit.params[6]).evidenceSha256,'b'.repeat(64));
  assert.equal(JSON.stringify(result).includes(userId),false);
  assert.equal(JSON.stringify(client.calls).includes('sessionToken'),false);
});

test('restoration comparison detects missing rows, changed fingerprints and schema drift',()=>{
  const original={tables:Object.fromEntries(['user_wallets','vanlinks','wallet_operations'].map(t=>[t,{count:'1',fingerprint:'abc'}])),indexes:[{indexname:'required'}],constraints:[{conname:'unique_required'}]};
  assert.equal(compareFingerprints(original,structuredClone(original)),true);
  for(const change of [copy=>copy.tables.user_wallets.count='0',copy=>copy.tables.vanlinks.fingerprint='changed',copy=>copy.indexes=[],copy=>copy.constraints=[]]){
    const actual=structuredClone(original);change(actual);assert.equal(compareFingerprints(original,actual),false);
  }
});


test('restoration verifier refuses an unbounded fingerprint scan',async()=>{
  const calls=[];
  const client={query:async sql=>{calls.push(sql);return {rows:[{count:'100001'}]};}};
  await assert.rejects(fingerprints(client),/verification_scope_exceeded/);
  assert.equal(calls.length,1);
  assert.equal(calls.some(sql=>sql.includes('row_to_json')),false);
});
