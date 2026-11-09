import { getAddress, parseUnits } from "viem";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { vanlinks } from "@/lib/db/schema";
import { polygonRpc } from "@/lib/chain/polygon";
import { POLYGON_EXPLORER, POLYGON_USDC_ADDRESS } from "@/lib/polygon/asset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const TOPIC_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a3df523b3ef";

type PolygonLog = { address?: string; topics?: string[]; data?: string };
type Receipt = { status?: string; blockNumber?: string; logs?: PolygonLog[] } | null;

function creditedTo(log: PolygonLog, recipient: string): bigint | null {
  if (!log.address || log.address.toLowerCase() !== POLYGON_USDC_ADDRESS.toLowerCase()) return null;
  if (log.topics?.length !== 3 || log.topics[0]?.toLowerCase() !== TOPIC_TRANSFER) return null;
  const to = log.topics[2];
  if (!to || !/^0x[0-9a-fA-F]{64}$/.test(to)) return null;
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(to.slice(2))) return null;
  const embedded = "0x" + to.slice(-40);
  if (embedded.toLowerCase() !== recipient.toLowerCase()) return null;
  if (!log.data || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) return null;
  return BigInt(log.data);
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z2-9]{6,16}$/.test(slug)) return Response.json({ error: "no_encontrado" }, { status: 404, headers: noStore });
  try {
    const raw = await request.text();
    if (raw.length > 512) return Response.json({ error: "solicitud_grande" }, { status: 400, headers: noStore });
    const body = JSON.parse(raw) as { txHash?: string };
    const hash = (body.txHash?.trim() || "").toLowerCase();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return Response.json({ error: "hash_invalido" }, { status: 400, headers: noStore });

    const [link] = await db().select().from(vanlinks).where(eq(vanlinks.slug, slug));
    if (!link) return Response.json({ error: "no_encontrado" }, { status: 404, headers: noStore });
    if (link.network !== "Polygon" || link.asset !== "USDC") return Response.json({ error: "red_no_soportada" }, { status: 400, headers: noStore });
    if (link.status === "pagado" && link.paidTx?.endsWith(hash)) return Response.json({ verified: true, explorer: link.paidTx }, { headers: noStore });
    if (link.status !== "activo" || (link.expiresAt && link.expiresAt <= new Date()))
      return Response.json({ error: "cobro_no_vigente" }, { status: 409, headers: noStore });

    const receipt = await polygonRpc<Receipt>("eth_getTransactionReceipt", [hash]);
    if (!receipt || receipt.status !== "0x1" || !receipt.blockNumber) {
      return Response.json({ verified: false, reason: "sin_confirmacion" }, { status: 409, headers: noStore });
    }
    const recipient = getAddress(link.address);
    const transfers = (receipt.logs || []).map(log => creditedTo(log, recipient)).filter((x): x is bigint => x !== null);
    const received = transfers.reduce((total, x) => total + x, BigInt(0));
    const min = link.amount ? parseUnits(link.amount, 6) : BigInt(1);
    if (received < min) return Response.json({ verified: false, reason: "transferencia_no_coincide" }, { status: 409, headers: noStore });
    const block = await polygonRpc<{ timestamp?: string }>("eth_getBlockByNumber", [receipt.blockNumber, false]);
    if (!block.timestamp || Number(BigInt(block.timestamp) * BigInt(1000)) < link.createdAt.getTime()) {
      return Response.json({ verified: false, reason: "pago_anterior_al_link" }, { status: 409, headers: noStore });
    }

    const explorer = POLYGON_EXPLORER + "/tx/" + hash;
    const verified = await db().transaction(async tx => {
      // Prevent the same transaction from being assigned to two different
      // VanLinks targeting the same wallet and amount.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${hash.toLowerCase()}, 0))`);
      const [already] = await tx.select().from(vanlinks).where(eq(vanlinks.paidTx, explorer));
      if (already && already.slug !== slug) return false;
      const updated = await tx.update(vanlinks)
        .set({ status: "pagado", paidTx: explorer, paidAt: new Date() })
        .where(and(eq(vanlinks.slug, slug), eq(vanlinks.status, "activo")))
        .returning({ slug: vanlinks.slug });
      return updated.length === 1;
    });
    if (!verified) return Response.json({ verified: false, reason: "pago_ya_asignado_o_invalido" }, { status: 409, headers: noStore });
    return Response.json({ verified: true, explorer, txHash: hash }, { headers: noStore });
  } catch (error) {
    console.error("polygon_vanlink_verify_failed", { reason: (error as Error)?.name || "unknown" });
    return Response.json({ error: "no_pudimos_verificar", message: "La red no confirmó el pago. Intenta de nuevo." }, { status: 503, headers: noStore });
  }
}
