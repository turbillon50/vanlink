import { Turnkey } from "@turnkey/sdk-server";
const ORG="8d42ab94-87f6-4c1b-9ed4-04a3e50f0337";
const SUB="02e681cd-dfdf-4956-b35d-bbb456afb742";
const c = new Turnkey({ apiBaseUrl:"https://api.turnkey.com",
  apiPublicKey:"02dfbe027f84b4ee3e75fe5d9e00c26cfccf2b9769d757a5fbdfe2d47d5439d9cd",
  apiPrivateKey:"66563f2d0aec3919879d15dcc440e5995933b7a4a9cd3eb3f4f63d0bd9fac0e2",
  defaultOrganizationId:ORG }).apiClient();
const u = await c.getUsers({ organizationId: SUB });
for (const x of u.users) {
  console.log("usuario:", x.userName, "|", x.userId);
  console.log("  apiKeys:", (x.apiKeys||[]).map(k => k.apiKeyName + " -> " + (k.credential?.publicKey||"").slice(0,20) + "..."));
  console.log("  authenticators:", (x.authenticators||[]).length);
  console.log("  oauth:", (x.oauthProviders||[]).length);
}
