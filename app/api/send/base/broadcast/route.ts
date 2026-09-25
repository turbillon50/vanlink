import { parseTransaction, recoverTransactionAddress, type Hex } from "viem";
import { baseBroadcast, currentWallet, errorResponse, noStore, SendError } from "@/lib/send/server";
import { BASE_CHAIN_ID } from "@/lib/send/base-tx";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const w = await currentWallet();
    const body = (await req.json().catch(() => ({}))) as { signed?: string };
    const raw = typeof body.signed === "string" ? body.signed.replace(/^0x/, "") : "";
    if (!/^[0-9a-f]+$/i.test(raw) || raw.length > 20_000) throw new SendError("tx_invalida");
    const signed = ("0x" + raw) as Hex;
    let from: string;
    try {
      if (parseTransaction(signed).chainId !== BASE_CHAIN_ID) throw new SendError("red_incorrecta");
      from = await recoverTransactionAddress({ serializedTransaction: signed as never });
    } catch (e) { if (e instanceof SendError) throw e; throw new SendError("tx_invalida"); }
    if (from.toLowerCase() !== w.evmAddress.toLowerCase()) throw new SendError("tx_ajena", 403, "Esa transacción no es de tu wallet.");
    const hash = await baseBroadcast(signed);
    console.info("[send] base transmitida", { hash });
    return Response.json({ hash, explorer: `https://basescan.org/tx/${hash}` }, { headers: noStore });
  } catch (e) { return errorResponse(e); }
}
