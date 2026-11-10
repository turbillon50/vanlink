import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import * as policy from '../lib/admin/policy.ts';
import { reverificationError } from '@clerk/nextjs/server';

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const actionCode = compile('../lib/admin/actions.ts');
const routeCode = compile('../app/api/admin/actions/route.ts');
const dataCode = compile('../lib/admin/data.ts');
class AdminAccessError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const base = { reason: 'Investigación autorizada', idempotencyKey: 'request_key_123456' };
const caseId = '11111111-1111-4111-8111-111111111111';
const grantId = '22222222-2222-4222-8222-222222222222';
function harness(options = {}) {
  const actor = { userId: 'user_actor', role: options.role || 'owner', permissions: policy.permissionsForRole(options.role || 'owner'), environment: 'preview' };
  let state = { activeRole: actor.role, keys: {}, cases: {}, notes: [], audits: [], jobs: {}, grants: [], failAudit: false, workerCalls: 0 };
  const queries = []; let commits = 0, rollbacks = 0, stepUps = 0;
  const query = async (sql, params = []) => {
    queries.push({ sql, params });
    const result = rows => ({ rows, rowCount: rows.length });
    if (sql.startsWith('SELECT pg_advisory')) return result([]);
    if (sql.startsWith('SELECT role FROM command_role_grants')) return result(state.activeRole ? [{ role: state.activeRole }] : []);
    if (sql.startsWith('SELECT * FROM command_action_keys')) return result(state.keys[params[2]] ? [state.keys[params[2]]] : []);
    if (sql.startsWith('INSERT INTO command_action_keys')) { state.keys[params[2]] = { input_hash: params[3], response: params[4] ? JSON.parse(params[4]) : null }; return result([]); }
    if (sql.startsWith('UPDATE command_action_keys')) { state.keys[params[2]].response = JSON.parse(params[3]); return result([]); }
    if (sql.startsWith('INSERT INTO command_audit')) { if (state.failAudit) throw new Error('audit_unavailable'); state.audits.push({ permission: params[3], resource: params[4], details: JSON.parse(params[8] || '{}') }); return result([]); }
    if (sql.startsWith('SELECT 1 FROM user_wallets')) return result(options.accountExists === false ? [] : [{}]);
    if (sql.startsWith('SELECT 1 FROM command_transactions')) return result(options.operationMismatch && sql.includes('AND account_id') ? [] : [{}]);
    if (sql.startsWith('INSERT INTO command_cases')) { state.cases[params[0]] = { id: params[0], environment: params[1], version: 1, status: 'open' }; return result([]); }
    if (sql.startsWith('UPDATE command_cases SET status')) { const row = state.cases[params[1]]; if (!row || row.environment !== params[2] || row.version !== params[3]) return result([]); row.status = params[0]; row.version++; return result([{ id: row.id }]); }
    if (sql.startsWith('UPDATE command_cases SET assignee')) { assert.match(sql, /environment=\$3/); return result([]); }
    if (sql.startsWith('INSERT INTO command_case_notes')) { state.notes.push({ note: params[3] }); return result([]); }
    if (sql.startsWith('SELECT * FROM command_role_grants')) return result(options.grant ? [options.grant] : []);
    if (sql.startsWith('SELECT 1 FROM command_role_grants')) return result(Array.from({ length: options.ownerCount ?? 2 }, () => ({})));
    if (sql.startsWith('UPDATE command_role_grants')) { assert.match(sql, /environment=/); state.grants.push({ revoked: true }); return result([]); }
    if (sql.startsWith('INSERT INTO command_role_grants')) { state.grants.push({ role: params[3], target: params[2] }); return result([]); }
    if (sql.startsWith('SELECT chain_id,tx_hash')) return result([{ chain_id: 137, tx_hash: '0xpublichash', account_id: 'user_private', amount_raw: '900719925474099399999999', state: '=HYPERLINK("https://example.invalid")' }]);
    if (sql.startsWith('INSERT INTO command_controls')) return result([]);
    throw new Error('Unexpected SQL in isolated action test: ' + sql);
  };
  const database = {
    commandEnvironment: () => 'preview', adminQuery: query,
    adminTransaction: async fn => {
      const snapshot = structuredClone(state);
      try { const output = await fn({ query }); commits++; return output; }
      catch (error) { state = snapshot; rollbacks++; throw error; }
    },
  };
  const imports = {
    'server-only': {}, 'node:crypto': crypto,
    '@clerk/nextjs/server': { clerkClient: async () => ({ users: { getUser: async id => ({ id }) } }) },
    './database': database, './policy': policy,
    './access': { AdminAccessError, requireStepUp: async () => { stepUps++; if (options.noStepUp) throw new AdminAccessError(403, 'admin_reverification_required'); } },
    './jobs': { runJobs: async () => { state.workerCalls++; return { processed: 0 }; } },
    './sources': { refreshIdentities: async () => ({}) },
  };
  const exports = {};
  vm.runInNewContext(actionCode, { exports, require: name => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; } });
  return { api: exports, actor, database, queries, get state() { return state; }, get commits() { return commits; }, get rollbacks() { return rollbacks; }, get stepUps() { return stepUps; } };
}

test('case change, private note, audit and idempotency commit together; exact replay makes no second change', async () => {
  const d = harness(); d.state.cases[caseId] = { id: caseId, environment: 'preview', version: 1, status: 'open' };
  const body = { ...base, action: 'updateCase', id: caseId, version: 1, status: 'investigating', note: 'Nota privada de prueba' };
  const first = await d.api.executeAction(d.actor, body);
  const replay = await d.api.executeAction(d.actor, body);
  assert.equal(replay.auditId, first.auditId);
  assert.equal(replay.replayed, true);
  assert.equal(d.state.cases[caseId].version, 2);
  assert.equal(d.state.notes.length, 1);
  assert.equal(d.state.audits.length, 1);
  assert.equal(JSON.stringify(d.state.audits).includes(body.note), false);
});

test('failed audit rolls back mutation, note and idempotency key', async () => {
  const d = harness(); d.state.failAudit = true;
  d.state.cases[caseId] = { id: caseId, environment: 'preview', version: 1, status: 'open' };
  await assert.rejects(d.api.executeAction(d.actor, { ...base, action: 'updateCase', id: caseId, version: 1, status: 'closed', note: 'Rollback note' }), /audit_unavailable/);
  assert.equal(d.state.cases[caseId].version, 1);
  assert.equal(d.state.notes.length, 0);
  assert.equal(Object.keys(d.state.keys).length, 0);
  assert.equal(d.rollbacks, 1);
});

test('version conflict, account-operation mismatch, and idempotency payload mismatch cannot commit', async () => {
  const d = harness(); d.state.cases[caseId] = { id: caseId, environment: 'preview', version: 2, status: 'open' };
  await assert.rejects(d.api.executeAction(d.actor, { ...base, action: 'updateCase', id: caseId, version: 1, status: 'closed' }), { status: 409, code: 'resource_version_conflict' });
  const first = { ...base, action: 'createCase', title: 'Caso de prueba' }; await d.api.executeAction(d.actor, first);
  await assert.rejects(d.api.executeAction(d.actor, { ...first, title: 'Otro caso' }), { status: 409, code: 'idempotency_conflict' });
  assert.equal(Object.keys(d.state.cases).length, 2);
  const mismatch = harness({ operationMismatch: true });
  await assert.rejects(mismatch.api.executeAction(mismatch.actor, { ...base, action: 'createCase', title: 'Caso incoherente', accountId: 'user_account', operationId: '0xhash' }), { code: 'case_account_operation_mismatch' });
  assert.equal(Object.keys(mismatch.state.cases).length, 0);
});

test('roles and MFA are checked before mutations, including revocation after request admission', async () => {
  const d = harness(); d.state.activeRole = null;
  await assert.rejects(d.api.executeAction(d.actor, { ...base, action: 'createCase', title: 'Denied case' }), { status: 403 });
  assert.equal(d.state.audits.length, 0);
  assert.equal(Object.keys(d.state.cases).length, 0);
  const support = harness({ role: 'support' });
  await assert.rejects(support.api.executeAction(support.actor, { ...base, action: 'pause', paused: true }), { status: 403 });
  const mfa = harness({ noStepUp: true });
  await assert.rejects(mfa.api.executeAction(mfa.actor, { ...base, action: 'export', resource: 'operations' }), { code: 'admin_reverification_required' });
  assert.equal(mfa.queries.length, 0);
});

test('self grants/revocations and last-owner revocation are prohibited; inherited action names are denied', async () => {
  const d = harness();
  await assert.rejects(d.api.executeAction(d.actor, { ...base, action: 'grantRole', userId: d.actor.userId, role: 'owner' }), { code: 'self_role_change_denied' });
  const ownGrant = harness({ grant: { clerk_user_id: 'user_actor', role: 'owner' } });
  await assert.rejects(ownGrant.api.executeAction(ownGrant.actor, { ...base, action: 'revokeRole', id: grantId }), { code: 'self_role_change_denied' });
  const last = harness({ grant: { clerk_user_id: 'user_other', role: 'owner' }, ownerCount: 1 });
  await assert.rejects(last.api.executeAction(last.actor, { ...base, action: 'revokeRole', id: grantId }), { code: 'last_owner_required' });
  for (const action of ['__proto__', 'constructor', 'toString']) await assert.rejects(d.api.executeAction(d.actor, { ...base, action }), { status: 403 });
  assert.equal(last.state.grants.length, 0);
});

test('CSV escapes formulas and quotes, preserves integer amounts, and never persists the downloaded CSV', async () => {
  const d = harness();
  for (const input of ['=cmd', '+formula', '-formula', '@formula', '  =cmd', '\tcommand', '\rcmd']) assert.equal(d.api.csvCell(input).startsWith('"\''), true);
  assert.equal(d.api.csvCell('a"b'), '"a""b"');
  const body = { ...base, action: 'export', resource: 'operations' };
  const result = await d.api.executeAction(d.actor, body);
  assert.match(result.csv, /900719925474099399999999/);
  assert.match(result.csv, /'=HYPERLINK/);
  assert.equal(JSON.stringify(d.state.audits).includes('user_private'), false);
  assert.equal(JSON.stringify(d.state.keys).includes('user_private'), false);
  assert.equal(JSON.stringify(d.state.keys).includes('csv'), false);
  await assert.rejects(d.api.executeAction(d.actor, body), { code: 'export_already_generated' });
  assert.equal(d.state.audits.length, 1);
});

test('repeated worker request reserves once and cannot invoke a second worker', async () => {
  const d = harness();
  const first = await d.api.executeAction(d.actor, { ...base, action: 'runJobs' });
  const second = await d.api.executeAction(d.actor, { ...base, action: 'runJobs' });
  assert.equal(second.auditId, first.auditId);
  assert.equal(d.state.workerCalls, 1);
  assert.equal(d.state.audits.length, 1);
});

function getData(role) {
  const queries = [];
  const exports = {};
  const imports = { 'server-only': {}, './policy': policy, './database': { commandEnvironment: () => 'preview', adminQuery: async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; } } };
  vm.runInNewContext(dataCode, { exports, Buffer, require: name => imports[name] });
  return { queries, api: exports, actor: { userId: 'user_actor', role, permissions: policy.permissionsForRole(role), environment: 'preview' } };
}

test('audit search, filter and pagination are scoped in SQL before rows reach support or operations', async () => {
  for (const role of ['support', 'operations']) {
    const d = getData(role);
    await d.api.listResource('audit', new URLSearchParams({ q: grantId, cursor: Buffer.from('cursor-id').toString('base64url') }), d.actor);
    const query = d.queries[0];
    assert.match(query.sql, /id::text ILIKE \$\d+/);
    assert.match(query.sql, /environment=\$1/);
    if (role === 'support') { const position=query.sql.match(/AND actor_id=\$(\d+)/); assert.ok(position); assert.equal(query.params[Number(position[1])-1], 'user_actor'); }
    else { const position=query.sql.match(/permission=ANY\(\$(\d+)::text\[\]\)/); assert.ok(position); assert.equal(query.params[Number(position[1])-1].includes('roles.write'), false); }
  }
});

function actionRoute(options = {}) {
  const d = harness(options); let permissionChecks = 0, identityReads = 0;
  const imports = {
    '@clerk/nextjs/server': { auth: async () => ({ userId: options.unauthenticated ? null : 'user_actor' }), reverificationError },
    '@/lib/admin/access': { AdminAccessError, requireAdmin: async permission => { permissionChecks++; if (options.unauthenticated) throw new AdminAccessError(401, 'admin_authentication_required'); if (!d.actor.permissions.includes(permission)) throw new AdminAccessError(403, 'admin_access_denied'); return d.actor; } },
    '@/lib/admin/actions': { ...d.api, refreshIdentities: async () => { identityReads++; } },
    '@/lib/admin/database': { commandEnvironment: () => 'preview', adminQuery: async sql => sql.startsWith('SELECT count') ? { rows: [{ count: 0 }] } : { rows: [] } },
  };
  const exports = {}; vm.runInNewContext(routeCode, { exports, Response, URL, crypto, require: name => imports[name] });
  return { d, get permissionChecks() { return permissionChecks; }, get identityReads() { return identityReads; }, post: (body, origin = 'https://example.invalid') => exports.POST(new Request('https://example.invalid/api/admin/actions', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) })) };
}

test('actual action handler rejects foreign origins and anonymous sessions before executing actions', async () => {
  const d = actionRoute(); assert.equal((await d.post({ ...base, action: 'createCase', title: 'Test' }, 'https://foreign.invalid')).status, 403); assert.equal(d.permissionChecks, 0); assert.equal(d.d.commits, 0);
  const anon = actionRoute({ unauthenticated: true }); assert.equal((await anon.post({ ...base, action: 'createCase', title: 'Test' })).status, 401); assert.equal(anon.d.commits, 0);
  const normal = actionRoute({ role: 'support' }); assert.equal((await normal.post({ ...base, action: 'grantRole', userId: 'user_other', role: 'owner' })).status, 403); assert.equal(normal.d.commits, 0);
});

test('actual action handler returns Clerk MFA hint while keeping the action blocked', async () => {
  const d = actionRoute({ noStepUp: true });
  const response = await d.post({ ...base, action: 'pause', paused: true });
  assert.equal(response.status, 403);
  const output = await response.json(); assert.equal(output.clerk_error.reason, 'reverification-error'); assert.equal(output.clerk_error.metadata.reverification.level, 'multi_factor'); assert.equal(output.clerk_error.metadata.reverification.afterMinutes, 5);
  assert.equal(d.d.commits, 0);
});


test('each list query binds exactly the placeholders it uses, with every filter and role combination', async () => {
  for (const role of ['owner','operations','support','auditor']) {
    for (const resource of ['cases','incidents','audit','grants','jobs','operations']) {
      for (const filters of [{}, { q: 'search', status: 'open', cursor: Buffer.from('cursor-value').toString('base64url'), limit: '25' }]) {
        const d = getData(role);
        await d.api.listResource(resource, new URLSearchParams(filters), d.actor);
        for (const query of d.queries) {
          const referenced = [...new Set(Array.from(query.sql.matchAll(/\$(\d+)/g), match => Number(match[1])))].sort((a,b)=>a-b);
          assert.deepEqual(referenced, Array.from({ length: query.params.length }, (_,index)=>index+1), `${resource}/${role}: unused or unbound placeholder`);
        }
      }
    }
  }
});
