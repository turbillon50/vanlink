import { Turnkey } from "@turnkey/sdk-server";
const ORG="8d42ab94-87f6-4c1b-9ed4-04a3e50f0337";
const SUB="02e681cd-dfdf-4956-b35d-bbb456afb742";
const c = new Turnkey({ apiBaseUrl:"https://api.turnkey.com",
  apiPublicKey:"02dfbe027f84b4ee3e75fe5d9e00c26cfccf2b9769d757a5fbdfe2d47d5439d9cd",
  apiPrivateKey:"66563f2d0aec3919879d15dcc440e5995933b7a4a9cd3eb3f4f63d0bd9fac0e2",
  defaultOrganizationId:ORG }).apiClient();
const { configs } = await c.getOrganizationConfigs({ organizationId: SUB });
console.log("quorum de la SUB-ORG:");
console.log("  threshold:", configs?.quorum?.threshold);
console.log("  userIds  :", configs?.quorum?.userIds);
console.log("\n¿el servicio padre (2dfaef5f...) esta en ese quorum?",
  (configs?.quorum?.userIds||[]).includes("2dfaef5f-6a6f-4400-9840-46867650e31c") ? "SI" : "NO");
