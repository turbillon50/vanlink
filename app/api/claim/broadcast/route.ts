import { externalMutationGuard } from "@/lib/admin/isolation";
import { errorResponse, linkBroadcast, noStore, SendError } from "@/lib/send/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const isolated = externalMutationGuard(req);
  if (isolated) return isolated;
  try {
    const body = (await req.json().catch(() => ({}))) as { hex?: string };
    if (typeof body.hex !== "string") throw new SendError("tx_invalida");
    const txid = await linkBroadcast(body.hex);
    console.info("[claim] link reclamado", { txid });
    return Response.json({ txid, explorer: `https://mempool.space/tx/${txid}` }, { headers: noStore });
  } catch (e) { return errorResponse(e); }
}
