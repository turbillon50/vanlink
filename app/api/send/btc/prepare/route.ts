import { btcFees, btcUtxos, currentWallet, errorResponse, noStore } from "@/lib/send/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** UTXOs confirmados de la wallet del usuario + comisiones actuales. El armado ocurre en el navegador. */
export async function GET() {
  try {
    const w = await currentWallet();
    const [{ utxos, pendingSats }, fees] = await Promise.all([btcUtxos(w.bitcoinAddress), btcFees()]);
    return Response.json({ address: w.bitcoinAddress, utxos, pendingSats, fees }, { headers: noStore });
  } catch (e) { return errorResponse(e); }
}
