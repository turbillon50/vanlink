import "server-only";
import { Turnkey, DEFAULT_ETHEREUM_ACCOUNTS, DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS } from "@turnkey/sdk-server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { walletConfig, walletProvisioningEnabled } from "./config";
import { assertServiceIdentity } from "./service-identity";
import { walletStep } from "./diagnostics";
import { reserveIntent, recordOrganization } from "./provision-intent";

export class WalletProvisioningPausedError extends Error {
  readonly code = "wallet_provisioning_paused";
  constructor() {
    super("New wallet provisioning is paused.");
    this.name = "WalletProvisioningPausedError";
  }
}

/** Read an existing mapping without instantiating or calling the provider SDK. */
export async function lookupExistingWallet(userId: string) {
  return (await db().select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0];
}

export async function provisionWallet(userId: string, publicKey: string, email: string | null = null) {
  const existing = await lookupExistingWallet(userId);
  if (existing) return existing;
  if (!walletProvisioningEnabled()) throw new WalletProvisioningPausedError();
  if (!email) throw new Error("Verified recovery email required");
  const config = walletConfig();
  const client = new Turnkey({ apiBaseUrl: "https://api.turnkey.com", defaultOrganizationId: config.parentId,
    apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!, apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY! }).apiClient();
  await walletStep("service_identity", () => assertServiceIdentity(client, config.parentId, config.serviceUserId));
  const { intent, dispatch } = await reserveIntent(userId, config.parentId, publicKey);
  const requestName = `VanDeFi/${intent.attempt_id}`;
  const find = async (filterType: string, filterValue: string) =>
    (await client.getSubOrgIds({ organizationId: config.parentId, filterType, filterValue })).organizationIds;
  const [byIntent, byKey, legacy, byEmail] = await Promise.all([
    find("NAME", requestName), find("PUBLIC_KEY", intent.public_key),
    find("NAME", `VanLink ${userId}`), find("EMAIL", email),
  ]);
  // Legacy resources require an independently verified binding, even if their
  // submitted key or email matches. Public identifiers cannot claim a wallet.
  if (legacy.length || byIntent.length > 1) throw new Error("Wallet reconciliation required");
  let organizationId = intent.organization_id ?? byIntent[0];
  if ([...byKey, ...byEmail, ...byIntent].some(id => id !== organizationId)) {
    throw new Error("Wallet reconciliation required");
  }
  if (!organizationId) {
    if (!dispatch) throw new Error("Wallet creation outcome uncertain");
    const created = await walletStep("wallet_create", () => client.createSubOrganization({
      organizationId: config.parentId, subOrganizationName: requestName, rootQuorumThreshold: 1,
      rootUsers: [{ userName: "Wallet owner", userEmail: email,
        apiKeys: [{ apiKeyName: "VanLink device", publicKey: intent.public_key, curveType: "API_KEY_CURVE_P256" }],
        authenticators: [], oauthProviders: [] }],
      wallet: { walletName: "VanLink", accounts: [...DEFAULT_ETHEREUM_ACCOUNTS, ...DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS] },
    }));
    organizationId = created.subOrganizationId;
  }
  await recordOrganization(intent.attempt_id, organizationId);
  const result = await walletStep("wallet_read", () => client.getWallets({ organizationId }));
  if (result.wallets.length !== 1) throw new Error("Unexpected wallet count");
  const walletId = result.wallets[0].walletId;
  const accounts = await walletStep("accounts_read", () => client.getWalletAccounts({ organizationId, walletId }));
  const evm = accounts.accounts.find(a => a.addressFormat === "ADDRESS_FORMAT_ETHEREUM");
  const btc = accounts.accounts.find(a => a.addressFormat === "ADDRESS_FORMAT_BITCOIN_MAINNET_P2WPKH");
  const users = await walletStep("owner_read", () => client.getUsers({ organizationId }));
  if (!evm || !btc || users.users.length !== 1) throw new Error("Wallet setup incomplete");
  const owner = users.users[0];
  const { apiKeys } = await client.getApiKeys({ organizationId, userId: owner.userId });
  if (owner.userEmail?.toLowerCase() !== email || !apiKeys.some(key =>
    key.credential.type.endsWith("_P256") && key.credential.publicKey.toLowerCase() === intent.public_key)) {
    throw new Error("Provisioning owner mismatch");
  }
  const mapping = { clerkUserId: userId, organizationId, walletId, turnkeyUserId: owner.userId,
    evmAddress: evm.address, bitcoinAddress: btc.address };
  await walletStep("wallet_save", () => db().insert(wallets).values(mapping)
    .onConflictDoNothing({ target: wallets.clerkUserId }));
  const confirmed = await lookupExistingWallet(userId);
  if (!confirmed || confirmed.organizationId !== organizationId || confirmed.walletId !== walletId ||
      confirmed.turnkeyUserId !== owner.userId || confirmed.evmAddress !== evm.address ||
      confirmed.bitcoinAddress !== btc.address) throw new Error("Wallet mapping conflict");
  return confirmed;
}
