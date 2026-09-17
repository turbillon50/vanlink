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

/**
 * Solicitudes de alta de un segundo dispositivo.
 *
 * El dispositivo nuevo deja aquí su llave pública y un código corto que el
 * usuario compara a simple vista en el dispositivo autorizado. El servidor
 * NUNCA autoriza: solo transporta la llave pública. La firma la hace el
 * dispositivo que ya es dueño de la sub-organización.
 */
export const deviceRequests = pgTable("wallet_device_requests", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  publicKey: text("public_key").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  status: text("status").notNull().default("pendiente"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
