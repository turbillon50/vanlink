import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Session and verified user.created deliveries converge on the same immutable identity. */
export async function ensureAccount(clerkUserId: string) {
  await db().execute(sql`INSERT INTO vandefi_accounts (clerk_user_id)
    VALUES (${clerkUserId}) ON CONFLICT (clerk_user_id) DO NOTHING`);
}
