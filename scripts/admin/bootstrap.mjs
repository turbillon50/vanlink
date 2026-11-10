#!/usr/bin/env node
/** One-time, out-of-app owner assignment. Never call from a web route. */
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export class BootstrapError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function parseFlags(args) {
  const allowed = new Set(['user-id', 'environment', 'reason', 'clerk-verified-evidence', 'database-url-file', 'operator-id']);
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2);
    if (!args[i]?.startsWith('--') || !allowed.has(key) || flags[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new BootstrapError('invalid_flags');
    flags[key] = args[i + 1];
  }
  for (const key of allowed) if (!flags[key]) throw new BootstrapError('missing_' + key.replaceAll('-', '_'));
  return flags;
}

export async function readPrivateFile(filename, maximumBytes = 16384) {
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > maximumBytes || (metadata.mode & 0o077) !== 0 ||
        (typeof process.getuid === 'function' && metadata.uid !== process.getuid())) throw new BootstrapError('private_file_required');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}

export function validateBootstrap(flags, evidence, connectionString, env = process.env, now = Date.now()) {
  const id = flags['user-id'];
  const operator = flags['operator-id'];
  if (!/^user_[A-Za-z0-9]{10,128}$/.test(id || '')) throw new BootstrapError('invalid_clerk_user_id');
  if (flags.environment !== 'preview' || env.VERCEL_ENV === 'production') throw new BootstrapError('preview_only');
  if (!/^[A-Za-z0-9_.:-]{3,120}$/.test(operator || '') || operator === id) throw new BootstrapError('external_operator_required');
  if (typeof flags.reason !== 'string' || flags.reason.trim().length < 12 || flags.reason.length > 500) throw new BootstrapError('reason_required');
  if (!env.ADMIN_NEON_BRANCH_ID || env.ADMIN_NEON_BRANCH_ID === 'br-small-feather-bc9qqmom' || !env.ADMIN_DATABASE_HOST) throw new BootstrapError('isolated_branch_required');
  let url;
  try { url = new URL(connectionString.trim()); } catch { throw new BootstrapError('invalid_connection'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== env.ADMIN_DATABASE_HOST || url.hostname.includes('-pooler.')) throw new BootstrapError('direct_branch_connection_required');
  if (!evidence || evidence.schemaVersion !== 1 || evidence.method !== 'authenticated-clerk-session' || evidence.clerkUserId !== id ||
      evidence.authorizedBy !== 'Luis' || evidence.environment !== 'preview' ||
      typeof evidence.authorizationReference !== 'string' || !/^[A-Za-z0-9_.:/-]{5,200}$/.test(evidence.authorizationReference)) throw new BootstrapError('verified_identity_evidence_required');
  const verified = Date.parse(evidence.verifiedAt);
  if (!Number.isFinite(verified) || verified > now + 60000 || now - verified > 86400000) throw new BootstrapError('identity_evidence_expired');
  if (!env.CLERK_OIDC_ISSUER || evidence.issuer !== env.CLERK_OIDC_ISSUER) throw new BootstrapError('clerk_issuer_mismatch');
  // Evidence contains identifiers and an attestation, never session tokens or OTP.
  const allowed = new Set(['schemaVersion', 'method', 'clerkUserId', 'authorizedBy', 'environment', 'authorizationReference', 'verifiedAt', 'issuer']);
  if (Object.keys(evidence).some(key => !allowed.has(key))) throw new BootstrapError('unexpected_evidence_fields');
  return { userId: id, environment: 'preview', operatorId: operator, reason: flags.reason.trim(), branchId: env.ADMIN_NEON_BRANCH_ID,
    connectionString: connectionString.trim(), verifiedAt: new Date(verified).toISOString(), issuer: evidence.issuer };
}

export async function performBootstrap(client, input, evidenceHash) {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL search_path = pg_catalog, public');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('vandefi.command.bootstrap.' || $1, 0))", [input.environment]);
    const marker = (await client.query('SELECT environment,neon_branch_id FROM command_environment WHERE singleton = true FOR UPDATE')).rows;
    if (marker.length !== 1 || marker[0].environment !== input.environment || marker[0].neon_branch_id !== input.branchId) throw new BootstrapError('database_marker_mismatch');
    const previous = await client.query('SELECT count(*)::text AS count FROM command_role_grants WHERE environment=$1', [input.environment]);
    if (previous.rows[0]?.count !== '0') throw new BootstrapError('bootstrap_already_initialized');
    const grantId = randomUUID(), auditId = randomUUID();
    const actor = 'bootstrap:' + input.operatorId;
    await client.query("INSERT INTO command_role_grants(id,clerk_user_id,role,environment,granted_by,reason) VALUES($1,$2,'owner',$3,$4,$5)", [grantId,input.userId,input.environment,actor,input.reason]);
    await client.query("INSERT INTO command_audit(id,environment,actor_id,permission,resource,reason,result,request_id,details) VALUES($1,$2,$3,'roles.bootstrap',$4,$5,'succeeded',$6,$7::jsonb)",
      [auditId,input.environment,actor,'grant:'+grantId,input.reason,'bootstrap:'+evidenceHash,JSON.stringify({grantId,evidenceSha256:evidenceHash,verifiedAt:input.verifiedAt,issuer:input.issuer,neonBranchId:input.branchId})]);
    await client.query('COMMIT');
    return { grantId,auditId,environment:input.environment,branchId:input.branchId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write('One-time preview bootstrap; operator must first verify the exact Clerk ID and authorization by Luis.\nRequired: --user-id --environment preview --reason --operator-id --clerk-verified-evidence <private-json-file> --database-url-file <private-file>\nEnvironment: ADMIN_NEON_BRANCH_ID, ADMIN_DATABASE_HOST (direct host), CLERK_OIDC_ISSUER.\nNo web endpoint, implicit identity matching or production bootstrap. See docs/ADMIN-OPERATIONS.md.\n');
    return;
  }
  const flags = parseFlags(process.argv.slice(2));
  const rawEvidence = await readPrivateFile(flags['clerk-verified-evidence']);
  let evidence;
  try { evidence = JSON.parse(rawEvidence); } catch { throw new BootstrapError('invalid_evidence_json'); }
  const connectionString = await readPrivateFile(flags['database-url-file']);
  const input = validateBootstrap(flags,evidence,connectionString);
  const client = new pg.Client({connectionString:input.connectionString,connectionTimeoutMillis:8000,statement_timeout:10000});
  try {
    await client.connect();
    const result = await performBootstrap(client,input,createHash('sha256').update(rawEvidence).digest('hex'));
    process.stdout.write(JSON.stringify({result:'owner_bootstrapped',...result}) + '\n');
  } finally { await client.end().catch(() => {}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // PostgreSQL/provider messages can include connection strings or account data.
    const code = error instanceof BootstrapError ? error.code : 'bootstrap_failed';
    process.stderr.write(JSON.stringify({error:code}) + '\n');
    process.exitCode = 1;
  });
}
