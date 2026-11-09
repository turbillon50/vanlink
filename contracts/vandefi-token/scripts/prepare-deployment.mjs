/**
 * PREPARA la operación de despliegue SIN enviarla a blockchain.
 *
 * Uso:
 *   VANX_TREASURY=0x... VANX_INITIAL_SUPPLY_WHOLE=... npm run plan:deployment -- amoy
 *
 * Ningún valor tiene default. No se leen claves privadas, mnemonics ni firmas.
 * El usuario debe revisar emisión, tesorería y chainId antes de autorizar
 * posteriormente la transacción desde su wallet Turnkey/multisig.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, getAddress, MaxUint256, ZeroAddress } from "ethers";
import { compileVanDeFiToken } from "./compile.mjs";

const networks = {
  amoy: { chainId: 80002, explorer: "https://amoy.polygonscan.com/", type: "ensayo" },
  polygon: { chainId: 137, explorer: "https://polygonscan.com/", type: "principal" },
};
const network = process.argv[2] || "amoy";

if (!(network in networks)) {
  throw new Error("Red no soportada. Usa amoy o polygon.");
}
const treasuryRaw = process.env.VANX_TREASURY;
const wholeRaw = process.env.VANX_INITIAL_SUPPLY_WHOLE;
if (!treasuryRaw || !wholeRaw) {
  throw new Error("Debes definir VANX_TREASURY y VANX_INITIAL_SUPPLY_WHOLE. Nunca usamos valores automáticos.");
}
const treasury = getAddress(treasuryRaw);
if (treasury === ZeroAddress) throw new Error("La tesorería no puede ser la dirección cero.");
if (!/^[1-9][0-9]*$/.test(wholeRaw)) throw new Error("Emisión inválida. Indica tokens enteros, positivos y sin decimales.");

const whole = BigInt(wholeRaw);
if (whole > MaxUint256 / (10n ** 18n)) throw new Error("La emisión supera el rango permitido para ERC-20.");

const compiled = compileVanDeFiToken();
const factory = new ContractFactory(compiled.abi, compiled.bytecode);
const unsigned = await factory.getDeployTransaction(treasury, whole);
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = path.join(directory, "artifacts", "deployment-review-" + network + ".json");

const manifest = {
  status: "DRAFT_NOT_DEPLOYED",
  name: "VanDeFi",
  symbol: "VANX",
  standard: "ERC-20",
  network: network,
  chainId: networks[network].chainId,
  networkType: networks[network].type,
  treasury,
  initialSupplyWhole: whole.toString(),
  decimals: 18,
  supplyBaseUnits: (whole * 10n ** 18n).toString(),
  contractBytecode: unsigned.data,
  explorer: networks[network].explorer,
  auditStatus: "not_independently_audited",
  notice: "NO se ha enviado ninguna transacción, no hay dirección de token y no es USDC.",
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2) + "\n");
console.log("Plan generado SIN desplegar ni firmar.");
console.log("Red:", network, "chainId:", manifest.chainId);
console.log("Tesorería:", treasury);
console.log("Emisión:", whole.toString(), "VANX");
console.log("Revisar localmente:", outputFile);
