import { Turnkey } from "@turnkey/sdk-server";
const ORG="8d42ab94-87f6-4c1b-9ed4-04a3e50f0337";
const SUB="02e681cd-dfdf-4956-b35d-bbb456afb742";
const WALLET="63f8dc79-5f2d-5142-8c9b-e09c259addf0";
const c = new Turnkey({ apiBaseUrl:"https://api.turnkey.com",
  apiPublicKey:"02dfbe027f84b4ee3e75fe5d9e00c26cfccf2b9769d757a5fbdfe2d47d5439d9cd",
  apiPrivateKey:"66563f2d0aec3919879d15dcc440e5995933b7a4a9cd3eb3f4f63d0bd9fac0e2",
  defaultOrganizationId:ORG }).apiClient();

console.log("=== metodos de exportacion disponibles en el SDK ===");
const metodos = Object.keys(Object.getPrototypeOf(c)).filter(k => /export|init/i.test(k));
console.log(metodos.join("\n"));

console.log("\n=== la wallet permite exportar? (intento de lectura) ===");
try {
  const w = await c.getWallet({ organizationId: SUB, walletId: WALLET });
  console.log("wallet:", w.wallet?.walletName, "| exportado antes:", w.wallet?.exported);
} catch (e) { console.log("ERROR getWallet:", (e.message||"").slice(0,140)); }
