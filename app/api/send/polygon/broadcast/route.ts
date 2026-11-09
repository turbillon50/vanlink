import { getAddress, keccak256, parseTransaction, recoverTransactionAddress, type Hex } from "viem";
import { polygonRpc } from "@/lib/chain/polygon";
import { POLYGON_CHAIN_ID, POLYGON_EXPLORER, POLYGON_USDT_ADDRESS } from "@/lib/polygon/asset";
import { currentWallet, errorResponse, noStore, SendError } from "@/lib/send/server";
import { polygonUsdtMoneyEnabled } from "@/lib/polygon/capabilities";
import { rememberPolygonOperation } from "@/lib/operations/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertUSDTTransfer(data: string | undefined): { recipient: string; amountRaw: string } {
  if (!data || !/^0xa9059cbb[0-9a-fA-F]{128}$/.test(data)) throw new SendError("operacion_invalida", 400,
    "La operación no es una transferencia simple de USDT.");
  const recipient = data.slice(10, 74);
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(recipient) || /^0+$/.test(recipient)) {
    throw new SendError("destino_invalido");
  }
  const value = BigInt("0x" + data.slice(74, 138));
  if (value <= BigInt(0)) throw new SendError("monto_invalido");
  return { recipient: "0x" + recipient.slice(-40), amountRaw: value.toString() };
}

export async function POST(request: Request) {
  try {
    if (!polygonUsdtMoneyEnabled()) throw new SendError("polygon_no_habilitado", 503,
      "Estamos validando los envíos USDT Polygon. Todavía no muevas fondos a esta red.");
    const wallet = await currentWallet();
    const body = await request.json().catch(() => ({})) as { signed?: unknown };
    const hex = typeof body.signed === "string" ? body.signed.replace(/^0x/, "") : "";
    if (!/^[0-9a-f]{100,20000}$/i.test(hex)) throw new SendError("tx_invalida");
    const signed = ("0x" + hex) as Hex;

    let from: string;
    let transfer: { recipient: string; amountRaw: string };
    try {
      const tx = parseTransaction(signed);
      if (tx.type !== "eip1559" || tx.chainId !== POLYGON_CHAIN_ID) throw new SendError("red_incorrecta");
      if (getAddress(tx.to || "0x0000000000000000000000000000000000000000") !== getAddress(POLYGON_USDT_ADDRESS)) {
        throw new SendError("contrato_incorrecto");
      }
      if ((tx.value ?? BigInt(0)) !== BigInt(0)) throw new SendError("valor_nativo_no_permitido");
      transfer = assertUSDTTransfer(tx.data);
      from = await recoverTransactionAddress({ serializedTransaction: signed as never });
    } catch (error) {
      if (error instanceof SendError) throw error;
      throw new SendError("tx_invalida");
    }
    if (from.toLowerCase() !== wallet.evmAddress.toLowerCase())
      throw new SendError("tx_ajena", 403, "Esa firma no corresponde a tu wallet.");

    const hash = keccak256(signed);
    try {
      await rememberPolygonOperation({
        clerkUserId: wallet.clerkUserId, walletAddress: wallet.evmAddress, hash, ...transfer,
      });
    } catch {
      throw new SendError("historial_no_disponible", 503,
        "No pudimos guardar el seguimiento. No se transmitió la operación.");
    }

    const result = (broadcastUncertain: boolean, message?: string) => Response.json({
      hash, explorer: POLYGON_EXPLORER + "/tx/" + hash, broadcastUncertain, ...(message ? { message } : {}),
    }, { status: broadcastUncertain ? 202 : 200, headers: noStore });

    try {
      const returnedHash = await polygonRpc<string>("eth_sendRawTransaction", [signed]);
      if (typeof returnedHash !== "string" || returnedHash.toLowerCase() !== hash) {
        return result(true, "La red devolvió una respuesta inesperada. Comprueba este mismo envío antes de intentar otro.");
      }
      return result(false);
    } catch (error) {
      const message = (error as Error)?.message;
      if (message === "polygon_insufficient_funds") throw new SendError("sin_pol", 400, "Necesitas POL para la comisión.");
      if (message === "polygon_already_known") return result(false);
      if (message === "polygon_nonce_too_low") {
        // Another transaction may have used this nonce; only this hash proves identity.
        try {
          const known = await polygonRpc<{ hash?: string } | null>("eth_getTransactionByHash", [hash]);
          if (known?.hash?.toLowerCase() === hash) return result(false);
        } catch { /* Keep the persisted hash and report uncertainty. */ }
        return result(true, "El nonce ya se usó; este envío todavía no está verificado. Comprueba su hash antes de intentar otro.");
      }
      return result(true, "La red no confirmó la recepción. Comprueba este mismo envío antes de intentar otro.");
    }
  } catch (error) {
    return errorResponse(error);
  }
}
