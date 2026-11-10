import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../lib/admin/database.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function database(options = {}) {
  const env = { ADMIN_ENABLED: 'true', ADMIN_ENVIRONMENT: 'preview', VERCEL_ENV: 'preview', ADMIN_NEON_BRANCH_ID: 'br-isolated-test', ADMIN_DATABASE_HOST: 'ep-isolated-test.neon.tech', DATABASE_URL: 'postgresql://test:placeholder@ep-isolated-test.neon.tech/neondb?sslmode=require', ...options.env };
  const state = { pools: 0, ended: 0, markers: 0, queries: [], released: 0 };
  async function query(sql) {
    if (sql.includes('FROM command_environment')) { state.markers++; return { rows: [{ environment: env.ADMIN_ENVIRONMENT, neon_branch_id: env.ADMIN_NEON_BRANCH_ID, migration_version: '20261110_command_center', migration_count: 1, ...options.marker }] }; }
    state.queries.push(sql);
    if (options.failMutation && sql === 'TEST MUTATION') throw new Error('test_mutation_failure');
    return { rows: [], rowCount: 0 };
  }
  class Pool {
    constructor() { state.pools++; }
    query = query;
    async connect() { return { query, release: () => state.released++ }; }
    async end() { state.ended++; }
  }
  const imports = { 'server-only': {}, 'pg': { Pool }, 'node:crypto': crypto, '@vercel/functions': { attachDatabasePool: () => {} } };
  const exports = {}; vm.runInNewContext(compiled, { exports, URL, process: { env }, require: name => imports[name] });
  return { api: exports, env, state };
}

test('every admin query checks the marker, branch and applied migration before reading or writing', async () => {
  const d = database(); await d.api.adminQuery('SELECT application_data'); await d.api.adminQuery('INSERT audit_failure');
  assert.equal(d.state.markers, 2);
  assert.deepEqual(d.state.queries, ['SELECT application_data', 'INSERT audit_failure']);
  for (const marker of [{ neon_branch_id: 'br-wrong-branch' }, { environment: 'production' }, { migration_version: 'old' }, { migration_count: 0 }]) {
    const bad = database({ marker }); await assert.rejects(bad.api.adminQuery('INSERT audit_failure'), /admin_database_mismatch/); assert.equal(bad.state.queries.length, 0);
  }
});

test('production, default production branch, wrong host, insecure remote URL and disabled configuration cannot open a pool', async () => {
  for (const env of [{ VERCEL_ENV: 'production' }, { ADMIN_NEON_BRANCH_ID: 'br-small-feather-bc9qqmom' }, { ADMIN_DATABASE_HOST: 'other.neon.tech' }, { DATABASE_URL: 'postgresql://test:placeholder@ep-isolated-test.neon.tech/neondb' }, { ADMIN_ENABLED: 'false' }, { ADMIN_ENVIRONMENT: 'test' }]) {
    const d = database({ env }); await assert.rejects(d.api.adminQuery('INSERT audit_failure'), /admin_(?:environment_denied|database_mismatch)/); assert.equal(d.state.pools, 0);
  }
});

test('environment disablement also prevents later failure-audit writes on an existing pool', async () => {
  const d = database(); await d.api.adminQuery('SELECT application_data'); d.env.ADMIN_ENABLED = 'false';
  await assert.rejects(d.api.adminQuery('INSERT audit_failure'), /admin_environment_denied/);
  assert.deepEqual(d.state.queries, ['SELECT application_data']);
});

test('endpoint change never reuses the prior database pool', async () => {
  const d = database(); await d.api.adminQuery('SELECT old_endpoint');
  d.env.DATABASE_URL = 'postgresql://test:placeholder@ep-another-test.neon.tech/neondb?sslmode=require'; d.env.ADMIN_DATABASE_HOST = 'ep-another-test.neon.tech';
  await d.api.adminQuery('SELECT new_endpoint');
  assert.equal(d.state.pools, 2); assert.equal(d.state.ended, 1); assert.equal(d.state.markers, 2);
});

test('transactions verify the marker, commit atomically and release; failed marker or mutation rolls back', async () => {
  const d = database(); await d.api.adminTransaction(async client => client.query('TEST MUTATION'));
  assert.deepEqual(d.state.queries, ['BEGIN', 'TEST MUTATION', 'COMMIT']); assert.equal(d.state.released, 1);
  const failure = database({ failMutation: true }); await assert.rejects(failure.api.adminTransaction(async client => client.query('TEST MUTATION')), /test_mutation_failure/);
  assert.deepEqual(failure.state.queries, ['BEGIN', 'TEST MUTATION', 'ROLLBACK']); assert.equal(failure.state.released, 1);
  const wrong = database({ marker: { migration_count: 0 } }); await assert.rejects(wrong.api.adminTransaction(async client => client.query('TEST MUTATION')), /admin_database_mismatch/);
  assert.deepEqual(wrong.state.queries, ['BEGIN', 'ROLLBACK']); assert.equal(wrong.state.released, 1);
});
