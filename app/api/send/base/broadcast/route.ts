import { externalMutationGuard } from "@/lib/admin/isolation";
import { baseBroadcast, currentWallet, errorResponse, noStore, SendError } from "@/lib/send/server";
import { validateBaseBroadcast } from "@/lib/send/base-broadcast-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const isolated = externalMutationGuard(req);
  if (isolated) return isolated;
  try {
    const wallet = await currentWallet();
    const body = (await req.json().catch(() => ({}))) as { signed?: unknown };
    const raw = typeof body.signed === "string" ? body.signed.replace(/^0x/, "") : "";
    if (!/^[0-9a-f]{100,20000}$/i.test(raw)) throw new SendError("tx_invalida");
    const signed = "0x" + raw;

    try {
      await validateBaseBroadcast(signed, wallet.evmAddress);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "tx_invalida";
      if (reason === "tx_ajena") throw new SendError(reason, 403, "La firma no corresponde a tu wallet.");
      throw new SendError(reason, 400, "La transacción firmada no es un envío autorizado en Base.");
    }

    const hash = await baseBroadcast(signed);
    console.info("[send] base transmitida", { hash });
    return Response.json({ hash, explorer: "https://basescan.org/tx/" + hash }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
