import { encodeFunctionData, erc20Abi } from "viem";
import { polygonRpc, POLYGON_USDT } from "@/lib/chain/polygon";
import { POLYGON_USDT_DECIMALS } from "@/lib/polygon/asset";
import { currentWallet, errorResponse, noStore, SendError } from "@/lib/send/server";
import { polygonUsdtMoneyEnabled } from "@/lib/polygon/capabilities";
import { normalizePolygonAddress } from "@/lib/send/polygon-tx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const wei = (hex: string) => BigInt(hex);

export async function GET(request: Request) {
  try {
    if (!polygonUsdtMoneyEnabled()) throw new SendError("polygon_no_habilitado", 503, "Estamos validando los envíos USDT Polygon. Todavía no muevas fondos a esta red.");
    const wallet = await currentWallet();
    const url = new URL(request.url);
    const to = normalizePolygonAddress(url.searchParams.get("to") || "");
    const input = url.searchParams.get("value") || "";
    if (!to) throw new SendError("direccion_invalida", 400, "Revisa la dirección de destino de Polygon.");
    if (to.toLowerCase() === wallet.evmAddress.toLowerCase()) throw new SendError("misma_wallet", 400, "No puedes enviarte a la misma dirección.");
    if (!/^[1-9]\d{0,39}$/.test(input)) throw new SendError("monto_invalido", 400, "Revisa el monto de USDT.");
    const amount = BigInt(input);

    const owner = wallet.evmAddress;
    const balanceData = "0x70a08231" + owner.slice(2).toLowerCase().padStart(64, "0");
    const [usdtHex, polHex, nonceHex, block, tipHex] = await Promise.all([
      polygonRpc<string>("eth_call", [{ to: POLYGON_USDT, data: balanceData }, "latest"]),
      polygonRpc<string>("eth_getBalance", [owner, "latest"]),
      polygonRpc<string>("eth_getTransactionCount", [owner, "pending"]),
      polygonRpc<{ baseFeePerGas?: string }>("eth_getBlockByNumber", ["latest", false]),
      polygonRpc<string>("eth_maxPriorityFeePerGas", []).catch(() => "0x0"),
    ]);
    const usdtBalance = wei(usdtHex);
    const polBalance = wei(polHex);
    if (usdtBalance < amount) throw new SendError("saldo_insuficiente", 400, "No tienes suficiente USDT en Polygon.");

    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
    let gasEstimate: bigint;
    try {
      gasEstimate = wei(await polygonRpc<string>("eth_estimateGas", [{
        from: owner, to: POLYGON_USDT, value: "0x0", data,
      }]));
    } catch {
      throw new SendError("simulacion_rechazada", 400, "Polygon rechazó la simulación. Revisa el saldo USDT y el POL para la comisión.");
    }
    const baseFee = block.baseFeePerGas ? wei(block.baseFeePerGas) : BigInt(0);
    const feeSuggestion = wei(await polygonRpc<string>("eth_gasPrice", []));
    const tip = wei(tipHex);
    const maxFee = (baseFee * BigInt(2) + tip) > feeSuggestion ? (baseFee * BigInt(2) + tip) : (feeSuggestion * BigInt(2));
    const gas = (gasEstimate * BigInt(125) / BigInt(100)) + BigInt(1);
    if (polBalance < gas * maxFee) throw new SendError("sin_pol", 400,
      "Para enviar USDT necesitas un poco de POL para la comisión de Polygon. VanDeFi todavía no patrocina el gas.");

    const quote = {
      nonce: Number(wei(nonceHex)),
      gas: gas.toString(),
      maxFeePerGas: maxFee.toString(),
      maxPriorityFeePerGas: tip.toString(),
      usdtBalance: usdtBalance.toString(),
      polBalance: polBalance.toString(),
      issuedAt: Date.now(),
    };
    return Response.json({
      network: "Polygon", chainId: 137,
      token: "USDT", decimals: POLYGON_USDT_DECIMALS,
      to, value: amount.toString(), from: owner, quote,
      expiryMs: Date.now() + 45_000,
    }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
