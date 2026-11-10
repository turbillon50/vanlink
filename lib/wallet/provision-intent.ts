import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type ProvisionIntent = {
  attempt_id: string;
  parent_id: string;
  public_key: string;
  organization_id: string | null;
};

/** Only the transaction that inserts a row gets the right to dispatch once.
 * A crash after commit can leave an unused reservation. Replays only reconcile.
 */
export async function reserveIntent(userId: string, parentId: string, publicKey: string) {
  return db().transaction(async tx => {
    const budget = await tx.execute<{ max_attempts: number }>(sql`
      SELECT max_attempts FROM wallet_provision_budget WHERE parent_id = ${parentId} FOR UPDATE`);
    const existing = await tx.execute<ProvisionIntent>(sql`
      SELECT attempt_id, parent_id, public_key, organization_id
      FROM wallet_provision_intents WHERE clerk_user_id = ${userId}`);
    if (existing.rows[0]) {
      if (existing.rows[0].parent_id !== parentId) throw new Error("Provisioning environment mismatch");
      return { intent: existing.rows[0], dispatch: false };
    }
    if (!budget.rows[0]) throw new Error("Provisioning budget unavailable");
    const reserved = await tx.execute<ProvisionIntent>(sql`
      INSERT INTO wallet_provision_intents (clerk_user_id, parent_id, public_key)
      SELECT ${userId}, ${parentId}, ${publicKey}
      WHERE (SELECT count(*) FROM wallet_provision_intents WHERE parent_id = ${parentId}) < ${budget.rows[0].max_attempts}
      RETURNING attempt_id, parent_id, public_key, organization_id`);
    if (!reserved.rows[0]) throw new Error("Provisioning budget exhausted");
    return { intent: reserved.rows[0], dispatch: true };
  });
}

export async function recordOrganization(attemptId: string, organizationId: string) {
  const result = await db().execute(sql`
    UPDATE wallet_provision_intents SET organization_id = ${organizationId}
    WHERE attempt_id = ${attemptId} AND (organization_id IS NULL OR organization_id = ${organizationId})
    RETURNING attempt_id`);
  if (!result.rows.length) throw new Error("Provisioning reconciliation conflict");
}
