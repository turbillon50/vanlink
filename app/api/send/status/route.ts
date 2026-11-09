import { btcStatus, currentWallet, errorResponse, noStore, SendError } from "@/lib/send/server";
import { inspectBaseHash } from "@/lib/chain/base-audit-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real blockchain state, not the success of the send API request.
 * A transaction can be broadcast successfully and still be pending,
 * unknown to this RPC, or reverted by the EVM.
 */
export async function GET(req: Request) {
  try {
    const wallet = await currentWallet();
    const q = new URL(req.url).searchParams;
    const network = q.get("network"), id = q.get("id") ?? "";
    const checkedAt = new Date().toISOString();

    if (network === "bitcoin" && /^[0-9a-f]{64}$/i.test(id)) {
      const state = await btcStatus(id);
      return Response.json({
        ...state, failed: false, phase: state.confirmed ? "confirmed" : "pending",
        confirmations: null, network, id, checkedAt,
        explorer: "https://mempool.space/tx/" + id.toLowerCase(),
      }, { headers: noStore });
    }

    if (network === "base" && /^0x[0-9a-f]{64}$/i.test(id)) {
      const result = await inspectBaseHash(id, wallet.evmAddress);
      if (!result.related && result.transactionSeen)
        throw new SendError("transaccion_ajena", 404, "Esta operación no pertenece a tu wallet.");

      const failed = result.receipt?.status === "0x0";
      const confirmed = result.receipt?.status === "0x1" &&
        (result.confirmations ?? 0) >= 1;
      const phase = failed ? "failed" : confirmed ? "confirmed"
        : result.receipt ? "confirming" : result.transactionSeen ? "pending" : "not_seen";

      return Response.json({
        network, id: id.toLowerCase(), phase, confirmed, failed,
        confirmations: result.confirmations, block: result.receipt?.blockNumber ?? null,
        transfers: result.transfers, checkedAt,
        explorer: "https://basescan.org/tx/" + id.toLowerCase(),
      }, { headers: noStore });
    }

    throw new SendError("parametros_invalidos", 400, "Especifica una red y un hash válidos.");
  } catch (error) { return errorResponse(error); }
}
