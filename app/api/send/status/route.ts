import { baseStatus, btcStatus, currentWallet, errorResponse, noStore, SendError } from "@/lib/send/server";
import { polygonRpc } from "@/lib/chain/polygon";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await currentWallet();
    const q = new URL(req.url).searchParams;
    const network = q.get("network"), id = q.get("id") ?? "";
    if (network === "bitcoin" && /^[0-9a-f]{64}$/i.test(id)) return Response.json(await btcStatus(id), { headers: noStore });
    if (network === "base" && /^0x[0-9a-f]{64}$/i.test(id)) return Response.json(await baseStatus(id), { headers: noStore });
    if (network === "polygon" && /^0x[0-9a-f]{64}$/i.test(id)) {
      const receipt = await polygonRpc<{ status?: string; blockNumber?: string } | null>("eth_getTransactionReceipt", [id]);
      return Response.json({
        confirmed: receipt?.status === "0x1",
        failed: receipt?.status === "0x0",
        block: receipt?.blockNumber ? Number(BigInt(receipt.blockNumber)) : null,
      }, { headers: noStore });
    }
    throw new SendError("parametros_invalidos");
  } catch (e) { return errorResponse(e); }
}
