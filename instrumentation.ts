export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL_ENV !== "production" || process.env.WALLET_ACTIVATION_ENABLED !== "true") return;
  const { Turnkey } = await import("@turnkey/sdk-server");
  const { assertServiceIdentity } = await import("./lib/wallet/service-identity");
  const { walletDiagnostic } = await import("./lib/wallet/diagnostics");
  try {
    const client = new Turnkey({ apiBaseUrl: "https://api.turnkey.com",
      defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID!,
      apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!, apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY! }).apiClient();
    await assertServiceIdentity(client, process.env.TURNKEY_ORGANIZATION_ID!, process.env.TURNKEY_SERVICE_USER_ID!);
    console.info("wallet_service_preflight", { ready: true });
  } catch (error) {
    console.error("wallet_service_preflight", { ready: false, ...walletDiagnostic(error) });
  }
}
