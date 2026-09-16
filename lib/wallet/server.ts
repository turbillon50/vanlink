import "server-only";
import { Turnkey, DEFAULT_ETHEREUM_ACCOUNTS, DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS } from "@turnkey/sdk-server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { walletConfig } from "./config";
import { assertServiceIdentity } from "./service-identity";
import { walletStep } from "./diagnostics";

export async function provisionWallet(userId: string, publicKey: string) {
  const config = walletConfig();
  const client = new Turnkey({ apiBaseUrl: "https://api.turnkey.com", defaultOrganizationId: config.parentId,
    apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!, apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY! }).apiClient();
  // A root credential must never be silently used as the production service.
  await walletStep("service_identity", () => assertServiceIdentity(client, config.parentId, config.serviceUserId));

  return db().transaction(async tx => {
    await walletStep("database_lock", () => tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`));
    const existing = (await walletStep("wallet_lookup", () => tx.select().from(wallets).where(eq(wallets.clerkUserId, userId))))[0];
    // A public key is unique to this browser device. The private half never reaches
    // our server, so it becomes the wallet owner's only root credential.
    const matches = await walletStep("device_lookup", () => client.getSubOrgIds({ organizationId: config.parentId, filterType: "PUBLIC_KEY", filterValue: publicKey }));
    if (matches.organizationIds.length > 1) throw new Error("Ambiguous wallet ownership");
    if (existing && matches.organizationIds[0] !== existing.organizationId) throw new Error("Wallet ownership mismatch");
    let organizationId = existing?.organizationId ?? matches.organizationIds[0];
    if (!organizationId) {
      const created = await walletStep("wallet_create", () => client.createSubOrganization({ organizationId: config.parentId,
        subOrganizationName: `VanLink ${userId}`, rootQuorumThreshold: 1,
        rootUsers: [{ userName: "Wallet owner", apiKeys: [{ apiKeyName: "VanLink device", publicKey,
          curveType: "API_KEY_CURVE_P256" }], authenticators: [], oauthProviders: [] }],
        wallet: { walletName: "VanLink", accounts: [...DEFAULT_ETHEREUM_ACCOUNTS, ...DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS] },
      }));
      organizationId = created.subOrganizationId;
    }
    if (existing) return existing;
    const result = await walletStep("wallet_read", () => client.getWallets({ organizationId }));
    if (result.wallets.length !== 1) throw new Error("Unexpected wallet count");
    const walletId = result.wallets[0].walletId;
    const accounts = await walletStep("accounts_read", () => client.getWalletAccounts({ organizationId, walletId }));
    const evm = accounts.accounts.find(a => a.addressFormat === "ADDRESS_FORMAT_ETHEREUM");
    const btc = accounts.accounts.find(a => a.addressFormat === "ADDRESS_FORMAT_BITCOIN_MAINNET_P2WPKH");
    const users = await walletStep("owner_read", () => client.getUsers({ organizationId }));
    if (!evm || !btc || users.users.length !== 1) throw new Error("Wallet setup incomplete");
    const [saved] = await walletStep("wallet_save", () => tx.insert(wallets).values({ clerkUserId: userId, organizationId, walletId,
      turnkeyUserId: users.users[0].userId, evmAddress: evm.address, bitcoinAddress: btc.address }).returning());
    return saved;
  });
}
