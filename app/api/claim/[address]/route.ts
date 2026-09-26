import { errorResponse, linkState, noStore, SendError } from "@/lib/send/server";
import { outputScript } from "@/lib/send/bitcoin-tx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Público: saldo de la dirección de un link. Nunca recibe la llave. */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await ctx.params;
    try { if (outputScript(address).kind !== "p2wpkh") throw new Error(); } catch { throw new SendError("direccion_invalida"); }
    return Response.json(await linkState(address), { headers: noStore });
  } catch (e) { return errorResponse(e); }
}
