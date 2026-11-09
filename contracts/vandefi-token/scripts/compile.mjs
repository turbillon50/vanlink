import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import solc from "solc";

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(base, "contracts", "VanDeFiToken.sol");

function resolveImport(importPath) {
  if (!importPath.startsWith("@openzeppelin/contracts/")) {
    return { error: "Import not permitted: " + importPath };
  }
  const fullPath = path.resolve(base, "node_modules", importPath);
  const allowedRoot = path.resolve(base, "node_modules", "@openzeppelin", "contracts") + path.sep;
  if (!fullPath.startsWith(allowedRoot) || !fs.existsSync(fullPath)) {
    return { error: "Missing OpenZeppelin dependency: " + importPath };
  }
  return { contents: fs.readFileSync(fullPath, "utf8") };
}

export function compileVanDeFiToken() {
  const input = {
    language: "Solidity",
    sources: {
      "VanDeFiToken.sol": { content: fs.readFileSync(sourcePath, "utf8") },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai",
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }));
  const failures = (output.errors || []).filter((error) => error.severity === "error");
  if (failures.length) {
    throw new Error(failures.map((error) => error.formattedMessage).join("\n"));
  }
  const contract = output.contracts?.["VanDeFiToken.sol"]?.VanDeFiToken;
  if (!contract?.abi || !contract?.evm?.bytecode?.object) {
    throw new Error("Compiler did not return VanDeFiToken bytecode");
  }
  return {
    contractName: "VanDeFiToken",
    sourceName: "VanDeFiToken.sol",
    compiler: solc.version(),
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
    deployedBytecode: "0x" + contract.evm.deployedBytecode.object,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const artifact = compileVanDeFiToken();
  const outputFile = path.join(base, "artifacts", "VanDeFiToken.json");
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(artifact, null, 2) + "\n");
  console.log("Contrato compilado con", artifact.compiler);
  console.log("ABI y bytecode en", outputFile);
}
