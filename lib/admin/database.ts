import 'server-only';
import { createHash } from 'node:crypto';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

const MIGRATION = '20261110_command_center';
const PRODUCTION_BRANCH = 'br-small-feather-bc9qqmom';
let pool: Pool | undefined;
let poolFingerprint = '';
export function commandEnvironment() { return process.env.ADMIN_ENVIRONMENT || 'disabled'; }

function configuration() {
  const environment = commandEnvironment();
  const connectionString = process.env.DATABASE_URL;
  const branchId = process.env.ADMIN_NEON_BRANCH_ID;
  const expectedHost = process.env.ADMIN_DATABASE_HOST;
  if (!['preview', 'test'].includes(environment) || process.env.ADMIN_ENABLED !== 'true' ||
      process.env.VERCEL_ENV === 'production' || (environment === 'test' && process.env.VERCEL_ENV)) throw new Error('admin_environment_denied');
  if (!connectionString || !branchId || !expectedHost || branchId === PRODUCTION_BRANCH) throw new Error('admin_database_mismatch');
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error('admin_database_mismatch'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== expectedHost ||
      !/^br-[a-z0-9-]{4,100}$/.test(branchId)) throw new Error('admin_database_mismatch');
  const localTest = environment === 'test' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!localTest && (!url.hostname.endsWith('.neon.tech') || !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') || ''))) throw new Error('admin_database_mismatch');
  return { environment, branchId, connectionString };
}

function commandPool(connectionString: string) {
  const fingerprint = createHash('sha256').update(connectionString).digest('hex');
  if (!pool || poolFingerprint !== fingerprint) {
    // Never reuse a previous endpoint if configuration is replaced in a long-lived process.
    const old = pool;
    pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 5000, statement_timeout: 10000 });
    poolFingerprint = fingerprint;
    attachDatabasePool(pool);
    if (old) void old.end().catch(() => {});
  }
  return pool;
}

async function assertMarker(query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>, config: ReturnType<typeof configuration>) {
  const result = await query(`SELECT environment,neon_branch_id,migration_version,
    (SELECT count(*)::int FROM command_migrations WHERE version=$1) AS migration_count
    FROM command_environment WHERE singleton=true`, [MIGRATION]);
  const row = result.rows[0];
  if (result.rows.length !== 1 || row.environment !== config.environment || row.neon_branch_id !== config.branchId ||
      row.migration_version !== MIGRATION || Number(row.migration_count) !== 1) throw new Error('admin_database_mismatch');
}

export async function assertAdminDatabase() {
  const config = configuration();
  const selectedPool = commandPool(config.connectionString);
  await assertMarker((text, values) => selectedPool.query(text, values), config);
}

/** Every path, including failed-action audit writes, checks the isolated database marker. */
export async function adminQuery<T extends QueryResultRow = Record<string, any>>(text: string, values: unknown[] = []) {
  const config = configuration();
  const selectedPool = commandPool(config.connectionString);
  await assertMarker((sql, params) => selectedPool.query(sql, params), config);
  return selectedPool.query<T>(text, values);
}

export async function adminTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const config = configuration();
  const client = await commandPool(config.connectionString).connect();
  try {
    await client.query('BEGIN');
    await assertMarker((text, values) => client.query(text, values), config);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
