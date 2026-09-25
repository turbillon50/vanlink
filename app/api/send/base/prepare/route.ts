import { encodeFunctionData, erc20Abi } from "viem";
import { baseQuote, currentWallet, errorResponse, noStore, SendError, tokenBalanceRaw } from "@/lib/send/server";
import { BASE_ASSETS, isBaseAsset, normalizeEvmAddress } from "@/lib/send/base-tx";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cotiza un envío en Base: nonce, gas y comisiones, más saldos para validar.
 * value llega en unidades mínimas del activo (string entero).
 */
export async function GET(req: Request) {
  try {
    const w = await currentWallet();
    const q = new URL(req.url).searchParams;
    const asset = q.get("asset") ?? "";
    const to = normalizeEvmAddress(q.get("to") ?? "");
    const valueStr = q.get("value") ?? "";
    if (!isBaseAsset(asset)) throw new SendError("activo_invalido");
    if (!to) throw new SendError("direccion_invalida", 400, "Esa dirección no es válida en Base.");
    if (!/^\d{1,40}$/.test(valueStr) || BigInt(valueStr) <= BigInt(0)) throw new SendError("monto_invalido");
    if (to.toLowerCase() === w.evmAddress.toLowerCase()) throw new SendError("misma_wallet", 400, "No puedes enviarte a tu misma dirección.");
    const value = BigInt(valueStr);
    const a = BASE_ASSETS[asset];
    const assetBalance = a.kind === "erc20" ? await tokenBalanceRaw(a.address, w.evmAddress) : null;
    if (assetBalance !== null && assetBalance < value) throw new SendError("saldo_insuficiente", 400, `No tienes suficiente ${a.label}.`);
    const quote = a.kind === "native"
      ? await baseQuote({ from: w.evmAddress, to, value: BigInt(0) })
      : await baseQuote({ from: w.evmAddress, to: a.address, value: BigInt(0),
          data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, value] }) });
    return Response.json({ from: w.evmAddress, to, asset, value: valueStr,
      assetBalance: (assetBalance ?? BigInt(quote.ethBalance)).toString(), quote }, { headers: noStore });
  } catch (e) { return errorResponse(e); }
}
