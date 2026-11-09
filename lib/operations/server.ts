import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { formatUnits } from "viem";
import { POLYGON_USDT_DECIMALS } from "@/lib/polygon/asset";
import { db } from "@/lib/db";
import { walletOperations } from "@/lib/db/schema";
import type { TrackedOperation } from "@/lib/operations/tracker";

/** Persist only public transaction metadata BEFORE any network emission. */
export async function rememberPolygonOperation(input: {
  clerkUserId: string; walletAddress: string; hash: string;
  recipient: string; amountRaw: string;
}): Promise<void> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.hash) ||
      !/^0x[0-9a-fA-F]{40}$/.test(input.walletAddress) ||
      !/^0x[0-9a-fA-F]{40}$/.test(input.recipient) ||
      !/^[0-9]{1,78}$/.test(input.amountRaw) || BigInt(input.amountRaw) <= BigInt(0)) {
    throw new Error("operation_invalid_metadata");
  }
  const record = {
    id: "polygon:" + input.hash.toLowerCase(),
    clerkUserId: input.clerkUserId,
    walletAddress: input.walletAddress.toLowerCase(),
    network: "polygon",
    txHash: input.hash.toLowerCase(),
    recipient: input.recipient.toLowerCase(),
    amountRaw: input.amountRaw,
  };
  const inserted = await db().insert(walletOperations).values(record).onConflictDoNothing().returning({ id: walletOperations.id });
  if (inserted.length) return;
  // A collision must never turn a foreign row into an authorized operation.
  const existing = (await db().select().from(walletOperations).where(and(
    eq(walletOperations.id, record.id),
    eq(walletOperations.clerkUserId, record.clerkUserId),
    eq(walletOperations.walletAddress, record.walletAddress),
  )).limit(1))[0];
  if (!existing || existing.txHash !== record.txHash || existing.recipient !== record.recipient ||
      existing.amountRaw !== record.amountRaw || existing.network !== "polygon") {
    throw new Error("operation_owner_mismatch");
  }
}

/** These are attempts, not confirmations. The chain determines their status. */
export async function serverTrackedOperations(clerkUserId: string, walletAddress: string): Promise<TrackedOperation[]> {
  const rows = await db().select().from(walletOperations).where(and(
    eq(walletOperations.clerkUserId, clerkUserId),
    eq(walletOperations.walletAddress, walletAddress.toLowerCase()),
    eq(walletOperations.network, "polygon"),
  )).orderBy(desc(walletOperations.createdAt)).limit(100);
  return rows.map(row => ({
    id: row.txHash,
    network: "polygon" as const,
    label: formatUnits(BigInt(row.amountRaw), POLYGON_USDT_DECIMALS) + " USDT",
    direction: "out" as const,
    createdAt: row.createdAt.toISOString(),
    phase: "submitted" as const,
    confirmations: null,
    checkedAt: null,
  }));
}
