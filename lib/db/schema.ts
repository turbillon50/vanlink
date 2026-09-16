import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const wallets = pgTable("user_wallets", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  organizationId: text("organization_id").notNull().unique(),
  walletId: text("wallet_id").notNull().unique(),
  turnkeyUserId: text("turnkey_user_id").notNull(),
  evmAddress: text("evm_address").notNull().unique(),
  bitcoinAddress: text("bitcoin_address").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const walletFlows = pgTable("wallet_oauth_flows", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  stateHash: text("state_hash").notNull().unique(),
  publicKey: text("public_key").notNull(),
  verifier: text("verifier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
