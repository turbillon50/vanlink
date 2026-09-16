import "server-only";
import { Turnkey, DEFAULT_ETHEREUM_ACCOUNTS, DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS } from "@turnkey/sdk-server";
import { eq, sql } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { walletConfig } from "./config";
import { assertIdentity } from "./security";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export async function exchangeIdentity(code: string, verifier: string, userId: string, publicKey: string) {
  const config = walletConfig();
  const response = await fetch(`${config.issuer}/oauth/token`, { method: "POST", cache: "no-store",
    signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier,
      client_id: config.clientId, redirect_uri: config.redirectUri }) });
  if (!response.ok) throw new Error("Identity exchange failed");
  const tokens = await response.json();
  if (typeof tokens.id_token !== "string") throw new Error("Missing identity token");
  jwks ??= createRemoteJWKSet(new URL(`${config.issuer}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: config.issuer,
    audience: config.clientId, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "nonce"] });
  assertIdentity(payload, userId, publicKey, config.clientId);
  return tokens.id_token as string;
}

export async function provisionWallet(userId: string, oidcToken: string, publicKey: string) {
  const config = walletConfig();
  const client = new Turnkey({ apiBaseUrl: "https://api.turnkey.com", defaultOrganizationId: config.parentId,
    apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!, apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY! }).apiClient();
  // A root credential must never be silently used as the production service.
  const identity = await client.getWhoami({ organizationId: config.parentId });
  if (identity.userId !== config.serviceUserId) throw new Error("Service identity mismatch");
  const organization = await client.getOrganization({ organizationId: config.parentId });
  if (organization.organization.rootQuorum.userIds.includes(identity.userId)) throw new Error("Root credentials prohibited");

  return db().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    const existing = (await tx.select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0];
    // Recover an interrupted create using the verified OIDC identity, never email.
    const matches = await client.getSubOrgIds({ organizationId: config.parentId, filterType: "OIDC_TOKEN", filterValue: oidcToken });
    if (matches.organizationIds.length > 1) throw new Error("Ambiguous wallet ownership");
    if (existing && matches.organizationIds[0] !== existing.organizationId) throw new Error("Wallet ownership mismatch");
    let organizationId = existing?.organizationId ?? matches.organizationIds[0];
    if (!organizationId) {
      const created = await client.createSubOrganization({ organizationId: config.parentId,
        subOrganizationName: `VanLink ${userId}`, rootQuorumThreshold: 1,
        rootUsers: [{ userName: "Wallet owner", apiKeys: [], authenticators: [],
          oauthProviders: [{ providerName: "Clerk", oidcToken }] }],
        wallet: { walletName: "VanLink", accounts: [...DEFAULT_ETHEREUM_ACCOUNTS, ...DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS] },
      });
      organizationId = created.subOrganizationId;
    }
    const session = await client.oauthLogin({ organizationId, oidcToken, publicKey, expirationSeconds: "3600", invalidateExisting: false });
    if (!session.session) throw new Error("Wallet session unavailable");
    // The JWT only describes the session. The browser signs requests with its
    // IndexedDB key; neither the wallet key nor a browser private key reaches us.
    if (existing) return existing;
    const result = await client.getWallets({ organizationId });
    if (result.wallets.length !== 1) throw new Error("Unexpected wallet count");
    const walletId = result.wallets[0].walletId;
    const accounts = await client.getWalletAccounts({ organizationId, walletId });
    const evm = accounts.accounts.find(a => a.addressFormat === "ADDRESS_FORMAT_ETHEREUM");
    const btc = accounts.accounts.find(a => a.addressFormat === "ADDRESS_FORMAT_BITCOIN_MAINNET_P2WPKH");
    const users = await client.getUsers({ organizationId });
    if (!evm || !btc || users.users.length !== 1) throw new Error("Wallet setup incomplete");
    const [saved] = await tx.insert(wallets).values({ clerkUserId: userId, organizationId, walletId,
      turnkeyUserId: users.users[0].userId, evmAddress: evm.address, bitcoinAddress: btc.address }).returning();
    return saved;
  });
}
