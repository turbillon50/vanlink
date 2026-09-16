import "server-only";

export function walletConfigured() {
  return process.env.WALLET_ACTIVATION_ENABLED === "true" && Boolean(
    process.env.TURNKEY_SERVICE_USER_ID && process.env.TURNKEY_ORGANIZATION_ID &&
    process.env.TURNKEY_API_PUBLIC_KEY && process.env.TURNKEY_API_PRIVATE_KEY &&
    process.env.DATABASE_URL && process.env.CLERK_OAUTH_CLIENT_ID &&
    process.env.CLERK_OIDC_ISSUER && process.env.APP_ORIGIN
  );
}

export function walletConfig() {
  if (!walletConfigured()) throw new Error("Wallet activation unavailable");
  const origin = new URL(process.env.APP_ORIGIN!).origin;
  const issuer = new URL(process.env.CLERK_OIDC_ISSUER!).origin;
  if (!origin.startsWith("https://") || !issuer.startsWith("https://")) throw new Error("HTTPS required");
  return { origin, issuer, clientId: process.env.CLERK_OAUTH_CLIENT_ID!,
    redirectUri: `${origin}/api/wallet/callback`, parentId: process.env.TURNKEY_ORGANIZATION_ID!,
    serviceUserId: process.env.TURNKEY_SERVICE_USER_ID! };
}
