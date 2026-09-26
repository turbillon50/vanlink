import { btcStatus, errorResponse, noStore, SendError } from "@/lib/send/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Público: estado de la transacción de un reclamo, para que la página lo refleje en vivo. */
export async function GET(_req: Request, ctx: { params: Promise<{ txid: string }> }) {
  try {
    const { txid } = await ctx.params;
    if (!/^[0-9a-f]{64}$/i.test(txid)) throw new SendError("txid_invalido");
    return Response.json(await btcStatus(txid), { headers: noStore });
  } catch (e) { return errorResponse(e); }
}
