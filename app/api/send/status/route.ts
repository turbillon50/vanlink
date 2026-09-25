import { baseStatus, btcStatus, currentWallet, errorResponse, noStore, SendError } from "@/lib/send/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await currentWallet();
    const q = new URL(req.url).searchParams;
    const network = q.get("network"), id = q.get("id") ?? "";
    if (network === "bitcoin" && /^[0-9a-f]{64}$/i.test(id)) return Response.json(await btcStatus(id), { headers: noStore });
    if (network === "base" && /^0x[0-9a-f]{64}$/i.test(id)) return Response.json(await baseStatus(id), { headers: noStore });
    throw new SendError("parametros_invalidos");
  } catch (e) { return errorResponse(e); }
}
