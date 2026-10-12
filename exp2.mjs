import { Turnkey } from "@turnkey/sdk-server";
const c = new Turnkey({ apiBaseUrl:"https://api.turnkey.com",
  apiPublicKey:"02dfbe027f84b4ee3e75fe5d9e00c26cfccf2b9769d757a5fbdfe2d47d5439d9cd",
  apiPrivateKey:"66563f2d0aec3919879d15dcc440e5995933b7a4a9cd3eb3f4f63d0bd9fac0e2",
  defaultOrganizationId:"8d42ab94-87f6-4c1b-9ed4-04a3e50f0337" }).apiClient();
const todos = [];
let o = c;
while (o && o !== Object.prototype) { todos.push(...Object.getOwnPropertyNames(o)); o = Object.getPrototypeOf(o); }
const u = [...new Set(todos)];
console.log("EXPORT:", u.filter(k => /export/i.test(k)).join(", ") || "(ninguno)");
console.log("INIT  :", u.filter(k => /^init/i.test(k)).join(", ") || "(ninguno)");
console.log("EMAIL :", u.filter(k => /email|recovery/i.test(k)).join(", ") || "(ninguno)");
console.log("total metodos:", u.length);
