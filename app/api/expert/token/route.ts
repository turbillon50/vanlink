import { auth } from "@clerk/nextjs/server";
import { formatUnits, getAddress, isAddress, decodeFunctionResult, erc20Abi, type Hex } from "viem";
import { polygonRpc } from "@/lib/chain/polygon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "no_autenticado" }, { status: 401, headers: noStore });

  const address = new URL(request.url).searchParams.get("contract") || "";
  if (!isAddress(address, { strict: false }) || /^0x0{40}$/i.test(address))
    return Response.json({ error: "contrato_invalido" }, { status: 400, headers: noStore });

  try {
    const { db } = await import("@/lib/db");
    const { wallets } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [wallet] = await db().select().from(wallets).where(eq(wallets.clerkUserId, userId));
    if (!wallet) return Response.json({ error: "sin_wallet" }, { status: 409, headers: noStore });

    const contract = getAddress(address);
    const code = await polygonRpc<string>("eth_getCode", [contract, "latest"]);
    if (code === "0x" || !/^0x[0-9a-f]+$/i.test(code))
      return Response.json({ error: "no_es_contrato" }, { status: 400, headers: noStore });
    const owner = wallet.evmAddress;
    const [rawBalance, rawDecimals, rawSymbol] = await Promise.all([
      polygonRpc<Hex>("eth_call", [{ to: contract, data: "0x70a08231" + owner.slice(2).toLowerCase().padStart(64, "0") }, "latest"]),
      polygonRpc<Hex>("eth_call", [{ to: contract, data: "0x313ce567" }, "latest"]),
      polygonRpc<Hex>("eth_call", [{ to: contract, data: "0x95d89b41" }, "latest"]).catch(() => "0x" as Hex),
    ]);
    if (!/^0x[0-9a-f]{64}$/i.test(rawBalance) || !/^0x[0-9a-f]{64}$/i.test(rawDecimals))
      throw new Error("contrato_erc20_invalido");
    const decimals = Number(BigInt(rawDecimals));
    if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36)
      throw new Error("decimales_invalidos");
    let symbol = "ERC20";
    try {
      const decoded = decodeFunctionResult({ abi: erc20Abi, functionName: "symbol", data: rawSymbol });
      if (typeof decoded === "string" && /^[a-z0-9.$_-]{1,14}$/i.test(decoded)) symbol = decoded;
    } catch { /* token may not implement metadata; never invent a known symbol */ }

    return Response.json({
      chainId: 137, network: "Polygon", contract, symbol,
      decimals, balance: formatUnits(BigInt(rawBalance), decimals),
      verified: false, // arbitrary tokens are never endorsed by VanDeFi
      source: process.env.POLYGON_RPC_URL || process.env.ALCHEMY_API_KEY ? "configured-rpc" : "public-rpc",
    }, { headers: noStore });
  } catch {
    return Response.json({ error: "token_no_disponible" }, { status: 502, headers: noStore });
  }
}
