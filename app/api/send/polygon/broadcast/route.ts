import { getAddress, parseTransaction, recoverTransactionAddress, type Hex } from "viem";
import { polygonRpc } from "@/lib/chain/polygon";
import { POLYGON_CHAIN_ID, POLYGON_EXPLORER, POLYGON_USDC_ADDRESS } from "@/lib/polygon/asset";
import { currentWallet, errorResponse, noStore, SendError } from "@/lib/send/server";
import { polygonUsdcMoneyEnabled } from "@/lib/polygon/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertUSDCTransfer(data: string | undefined): void {
  if (!data || !/^0xa9059cbb[0-9a-fA-F]{128}$/.test(data)) throw new SendError("operacion_invalida", 400,
    "La operación no es una transferencia simple de USDC.");
  const recipient = data.slice(10, 74);
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(recipient) || /^0+$/.test(recipient)) {
    throw new SendError("destino_invalido");
  }
  const value = BigInt("0x" + data.slice(74, 138));
  if (value <= BigInt(0)) throw new SendError("monto_invalido");
}

export async function POST(request: Request) {
  try {
    if (!polygonUsdcMoneyEnabled()) throw new SendError("polygon_no_habilitado", 503, "Estamos validando los envíos USDC Polygon. Todavía no muevas fondos a esta red.");
    const wallet = await currentWallet();
    const body = await request.json().catch(() => ({})) as { signed?: unknown };
    const hex = typeof body.signed === "string" ? body.signed.replace(/^0x/, "") : "";
    if (!/^[0-9a-f]{100,20000}$/i.test(hex)) throw new SendError("tx_invalida");
    const signed = ("0x" + hex) as Hex;

    let from: string;
    try {
      const tx = parseTransaction(signed);
      if (tx.type !== "eip1559" || tx.chainId !== POLYGON_CHAIN_ID) throw new SendError("red_incorrecta");
      if (getAddress(tx.to || "0x0000000000000000000000000000000000000000") !== getAddress(POLYGON_USDC_ADDRESS)) {
        throw new SendError("contrato_incorrecto");
      }
      if ((tx.value ?? BigInt(0)) !== BigInt(0)) throw new SendError("valor_nativo_no_permitido");
      assertUSDCTransfer(tx.data);
      from = await recoverTransactionAddress({ serializedTransaction: signed as never });
    } catch (error) {
      if (error instanceof SendError) throw error;
      throw new SendError("tx_invalida");
    }
    if (from.toLowerCase() !== wallet.evmAddress.toLowerCase())
      throw new SendError("tx_ajena", 403, "Esa firma no corresponde a tu wallet.");

    let hash: string;
    try {
      hash = await polygonRpc<string>("eth_sendRawTransaction", [signed]);
    } catch (error) {
      const message = String((error as Error)?.message || "");
      if (/nonce too low|already known/i.test(message)) throw new SendError("ya_enviada", 409);
      if (/insufficient funds/i.test(message)) throw new SendError("sin_pol", 400, "Necesitas POL para la comisión.");
      throw new SendError("polygon_rechazada", 400, "Polygon rechazó la transacción. Revisa los fondos y vuelve a cotizar.");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new SendError("hash_invalido", 502);
    return Response.json({ hash, explorer: POLYGON_EXPLORER + "/tx/" + hash }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
