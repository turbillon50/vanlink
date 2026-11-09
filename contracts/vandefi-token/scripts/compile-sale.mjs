import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import solc from "solc";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = [
  "VanDeFiToken.sol",
  "VDFIPrimarySale.sol",
  "VDFIYearReserve.sol",
  "test-contracts/MockUSDC.sol",
];

function resolveImport(importPath) {
  if (importPath.startsWith("@openzeppelin/contracts/")) {
    const fullPath = path.resolve(root, "node_modules", importPath);
    const allowed = path.resolve(root, "node_modules", "@openzeppelin", "contracts") + path.sep;
    if (!fullPath.startsWith(allowed) || !fs.existsSync(fullPath)) {
      return { error: "OpenZeppelin import unavailable" };
    }
    return { contents: fs.readFileSync(fullPath, "utf8") };
  }
  const local = importPath.replace(/^\.\//, "");
  if (!["VDFIYearReserve.sol", "VDFIPrimarySale.sol", "VanDeFiToken.sol"].includes(local)) {
    return { error: "Local import not allowed: " + importPath };
  }
  return { contents: fs.readFileSync(path.join(root, "contracts", local), "utf8") };
}

export function compileVDFISaleSuite() {
  const sources = Object.fromEntries(sourceFiles.map(name => [
    name, { content: fs.readFileSync(path.join(root, name.startsWith("test-") ? name : "contracts/" + name), "utf8") },
  ]));
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai",
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }));
  const errors = (output.errors || []).filter(e => e.severity === "error");
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join("\n"));

  const pick = (source, name) => {
    const c = output.contracts?.[source]?.[name];
    if (!c?.abi || !c?.evm?.bytecode?.object) throw new Error("Missing compiled " + name);
    return {
      contractName: name,
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
    };
  };

  return {
    compiler: solc.version(),
    token: pick("VanDeFiToken.sol", "VanDeFiToken"),
    sale: pick("VDFIPrimarySale.sol", "VDFIPrimarySale"),
    reserve: pick("VDFIYearReserve.sol", "VDFIYearReserve"),
    testUSDC: pick("test-contracts/MockUSDC.sol", "MockUSDC"),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = compileVDFISaleSuite();
  const artifacts = path.join(root, "artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  for (const key of ["token", "sale", "reserve"]) {
    fs.writeFileSync(path.join(artifacts, result[key].contractName + ".json"),
      JSON.stringify(result[key], null, 2) + "\n");
  }
  console.log("Token, venta y reserva compilados con", result.compiler);
  console.log("No se ha emitido ninguna transacción");
}
