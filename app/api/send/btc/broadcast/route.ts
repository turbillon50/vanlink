import { btcBroadcast, currentWallet, errorResponse, noStore, SendError } from "@/lib/send/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const w = await currentWallet();
    const body = (await req.json().catch(() => ({}))) as { hex?: string };
    if (typeof body.hex !== "string") throw new SendError("tx_invalida");
    const txid = await btcBroadcast(body.hex, w.bitcoinAddress);
    console.info("[send] btc transmitida", { txid });
    return Response.json({ txid, explorer: `https://mempool.space/tx/${txid}` }, { headers: noStore });
  } catch (e) { return errorResponse(e); }
}
