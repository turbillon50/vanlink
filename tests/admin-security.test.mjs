import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from '../lib/admin/policy.ts';
import { blocksExternalMutation, isAdminPreviewIsolated } from '../lib/admin/isolation.ts';
import { createWalletSessionGuard } from '../lib/wallet/session.ts';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const accessCode = transpile('../lib/admin/access.ts');
function access(options = {}) {
  const queries = [];
  const state = { role: options.role, userId: options.userId === undefined ? 'user_actor' : options.userId, stepUp: false, factorAges: [0,0] };
  const exports = {};
  const imports = {
    'server-only': {},
    '@clerk/nextjs/server': { auth: async () => ({ userId: state.userId, factorVerificationAge: state.factorAges, has: requirement => { assert.deepEqual(JSON.parse(JSON.stringify(requirement)), { reverification: { level: 'multi_factor', afterMinutes: 5 } }); return state.stepUp; } }) },
    './policy': policy,
    './database': {
      assertAdminDatabase: async () => { if (options.databaseMismatch) throw new Error('wrong_database'); },
      adminQuery: async (sql, params) => { queries.push({ sql, params }); return { rows: options.rows || (state.role ? [{ role: state.role }] : []) }; },
    },
  };
  vm.runInNewContext(accessCode, { exports, process: { env: { ADMIN_ENABLED: 'true', ADMIN_ENVIRONMENT: 'preview', VERCEL_ENV: 'preview', ...options.env } }, require: name => { assert.ok(Object.hasOwn(imports, name)); return imports[name]; } });
  return { api: exports, queries, state };
}

test('RBAC denies missing, inherited and unknown roles, and returns independent permission copies', () => {
  for (const role of [undefined, null, '', 'admin', '__proto__', 'constructor', 'normal']) assert.equal(policy.roleHasPermission(role, 'overview.read'), false);
  const permissions = policy.permissionsForRole('support'); permissions.push('roles.write');
  assert.equal(policy.roleHasPermission('support', 'roles.write'), false);
  assert.equal(policy.roleHasPermission('support', 'pii.read'), true);
  assert.equal(policy.roleHasPermission('auditor', 'pii.read'), false);
  assert.equal(policy.roleHasPermission('operations', 'reconcile.run'), true);
  for (const role of ['support', 'operations', 'auditor']) for (const action of ['pause.write', 'roles.write', 'export.run']) assert.equal(policy.roleHasPermission(role, action), false);
  assert.equal(policy.mayChangeGrant('user_actor', 'user_actor', 'owner'), false);
  assert.equal(policy.mayChangeGrant('user_actor', 'user_other', 'owner'), true);
});

test('Clerk session is required before database checks; request headers cannot supply identity or role', async () => {
  const d = access({ userId: null });
  await assert.rejects(d.api.requireAdmin('overview.read', new Request('https://example.invalid/api/admin/overview', { headers: { 'X-Admin-Role': 'owner', 'X-User-Id': 'user_actor' } })), { status: 401 });
  assert.equal(d.queries.length, 0);
});

test('every request reads active grants scoped to the environment and sees immediate revocation', async () => {
  const d = access({ role: 'owner' });
  const viewer = await d.api.requireAdmin('roles.write');
  assert.equal(viewer.role, 'owner');
  assert.deepEqual(Array.from(d.queries[0].params), ['user_actor', 'preview']);
  assert.match(d.queries[0].sql, /revoked_at IS NULL/);
  d.state.role = null;
  await assert.rejects(d.api.requireAdmin('roles.write'), { status: 403 });
  assert.equal(d.queries.length, 2);
});

test('missing, ambiguous and forged roles deny permissions', async () => {
  for (const rows of [[], [{ role: 'owner' }, { role: 'support' }], [{ role: '__proto__' }], [{ role: 'normal' }]]) {
    await assert.rejects(access({ rows }).api.requireAdmin('overview.read'), { status: 403 });
  }
  await assert.rejects(access({ role: 'support' }).api.requireAdmin('roles.write'), { status: 403 });
});

test('production, disabled admin, nonlocal test and database mismatch fail closed', async () => {
  for (const options of [{ env: { VERCEL_ENV: 'production' } }, { env: { ADMIN_ENABLED: 'false' } }, { env: { ADMIN_ENVIRONMENT: 'test' } }, { databaseMismatch: true }]) {
    const d = access({ role: 'owner', ...options });
    await assert.rejects(d.api.requireAdmin('overview.read'), { status: 503 });
    assert.equal(d.queries.length, 0);
  }
});

test('sensitive actions require recent MFA and fail closed without it', async () => {
  const d = access({ role: 'owner' });
  await assert.rejects(d.api.requireStepUp(), { status: 403, code: 'admin_reverification_required' });
  d.state.stepUp = true;
  await d.api.requireStepUp();
});

test('all external mutation verbs are blocked in preview even when admin is disabled', () => {
  for (const env of [{ VERCEL_ENV: 'preview' }, { ADMIN_ENVIRONMENT: 'preview', ADMIN_ENABLED: 'false' }, { ADMIN_PREVIEW_ISOLATED: 'true' }, { ADMIN_ENVIRONMENT: 'test' }]) {
    assert.equal(isAdminPreviewIsolated(env), true);
    for (const path of ['/api/wallet/start', '/api/wallet/recover/start', '/api/wallet/recover/verify', '/api/account/delete', '/api/send/base/broadcast', '/api/send/btc/broadcast', '/api/send/polygon/broadcast', '/api/claim/broadcast', '/api/vanlink', '/api/vanlink/example/verify', '/api/onramp/webhook']) {
      for (const verb of ['POST', 'PATCH', 'DELETE', 'PUT']) assert.equal(blocksExternalMutation(path, verb, env), true);
      assert.equal(blocksExternalMutation(path, 'GET', env), false);
    }
    assert.equal(blocksExternalMutation('/api/admin/actions', 'POST', env), false);
  }
  assert.equal(blocksExternalMutation('/api/wallet/start', 'POST', { VERCEL_ENV: 'production', ADMIN_ENVIRONMENT: 'preview' }), false);
});

test('account or session switch invalidates delayed work, including A to B to A, without touching browser storage', () => {
  const session = createWalletSessionGuard();
  session.synchronize('user-a', 'session-a');
  const token = session.capture();
  session.synchronize('user-b', 'session-b');
  assert.throws(() => session.assert(token), /wallet_session_changed/);
  session.synchronize('user-a', 'session-a');
  assert.throws(() => session.assert(token), /wallet_session_changed/);
  const fresh = session.capture();
  session.assert(fresh, 'user-a');
  session.synchronize('user-a', 'new-session-a');
  assert.throws(() => session.assert(fresh), /wallet_session_changed/);
});

const provisionCode = transpile('../lib/wallet/server.ts');
test('knowing an orphan public key never adopts, recreates or reads the wallet', async () => {
  const writes = [];
  const client = { getSubOrgIds: async () => ({ organizationIds: ['orphan-org'] }), createSubOrganization: async () => writes.push('create'), getWallets: async () => writes.push('read') };
  const tx = { execute: async () => {}, select: () => ({ from: () => ({ where: async () => [] }) }), insert: () => { writes.push('insert'); } };
  const imports = { 'server-only': {}, '@turnkey/sdk-server': { Turnkey: class { apiClient() { return client; } } }, 'drizzle-orm': { eq: () => {}, sql: () => {} }, '@/lib/db': { db: () => ({ transaction: async fn => fn(tx) }) }, '@/lib/db/schema': { wallets: {} }, './config': { walletConfig: () => ({ parentId: 'test-parent', serviceUserId: 'test-service' }) }, './service-identity': { assertServiceIdentity: async () => {} }, './diagnostics': { walletStep: async (_step, fn) => fn() } };
  const exports = {};
  vm.runInNewContext(provisionCode, { exports, process: { env: {} }, require: name => { assert.ok(Object.hasOwn(imports, name)); return imports[name]; } });
  await assert.rejects(exports.provisionWallet('user_actor', 'known-public-key', 'private@example.invalid'), /wallet_orphan_requires_owner_verification/);
  assert.deepEqual(writes, []);
});

test('direct external handlers block preview mutations before any authenticated or provider dependency is used', async () => {
  const isolation = {};
  vm.runInNewContext(transpile('../lib/admin/isolation.ts'), { exports: isolation, URL, Response, process: { env: { VERCEL_ENV: 'preview', ADMIN_ENABLED: 'false' } } });
  const paths = ['wallet/start', 'wallet/recover/start', 'wallet/recover/verify', 'account/delete', 'send/base/broadcast', 'send/btc/broadcast', 'send/polygon/broadcast', 'claim/broadcast', 'onramp/webhook', 'vanlink', 'vanlink/[slug]/verify'];
  for (const path of paths) {
    const exports = {};
    vm.runInNewContext(transpile(`../app/api/${path}/route.ts`), { exports, require: name => name === '@/lib/admin/isolation' ? isolation : new Proxy({}, { get() { assert.fail('dependency used before isolation: ' + path + ' ' + name); } }) });
    for (const method of path === 'vanlink' ? ['POST', 'PATCH'] : ['POST']) {
      const response = await exports[method](new Request(`https://example.invalid/api/${path}`, { method }), { params: Promise.resolve({ slug: 'abcdef' }) });
      assert.equal(response.status, 403, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
});

test('fiat activity ignores foreign wallet queries and requires the authenticated wallet', async () => {
  let authenticated = true;
  const queriedWallets = [];
  const exports = {};
  const imports = {
    'next/server': { NextResponse: Response },
    '@/lib/send/server': { currentWallet: async () => { if (!authenticated) throw Object.assign(new Error('no_session'), { status: 401 }); return { evmAddress: 'own-wallet' }; }, errorResponse: e => Response.json({ error: 'denied' }, { status: e.status || 502 }), noStore: { 'Cache-Control': 'no-store' } },
    '@/lib/fiat/activity-store': { listFiatActivityForUser: async address => { queriedWallets.push(address); return []; } },
  };
  vm.runInNewContext(transpile('../app/api/onramp/activity/route.ts'), { exports, require: name => imports[name] });
  const request = new Request('https://example.invalid/api/onramp/activity?wallet=foreign-wallet');
  const response = await exports.GET(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(queriedWallets, ['own-wallet']);
  authenticated = false;
  assert.equal((await exports.GET(request)).status, 401);
  assert.deepEqual(queriedWallets, ['own-wallet']);
});


test('Clerk first-factor fallback cannot authorize actions without proof of a verified second factor', async () => {
  const d = access({ role: 'owner' }); d.state.stepUp = true;
  for (const ages of [[0,-1], null, [-1,0], [0,Number.NaN]]) {
    d.state.factorAges = ages;
    await assert.rejects(d.api.requireStepUp(), { status: 403, code: 'admin_mfa_required' });
  }
  d.state.factorAges = [0,0]; await d.api.requireStepUp();
});
