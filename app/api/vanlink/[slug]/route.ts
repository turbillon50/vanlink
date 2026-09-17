/**
 * Consulta PÚBLICA de un VanLink + detección del pago en cadena.
 *
 * No expone quién es el cobrador ni su cuenta: solo lo necesario para pagar.
 * La detección compara movimientos entrantes posteriores a la creación del
 * link; si hay monto, exige que coincida.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vanlinks } from "@/lib/db/schema";
import { paymentUri, type AssetKey } from "@/lib/vanlink";
import { baseMovements, bitcoinMovements } from "@/lib/chain/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z2-9]{6,16}$/.test(slug)) {
    return NextResponse.json({ error: "no_encontrado" }, { status: 404, headers });
  }

  const link = (await db().select().from(vanlinks).where(eq(vanlinks.slug, slug)))[0];
  if (!link) return NextResponse.json({ error: "no_encontrado" }, { status: 404, headers });

  const expirado = link.expiresAt ? link.expiresAt.getTime() < Date.now() : false;
  const estado = link.status === "activo" && expirado ? "expirado" : link.status;

  // Detección de pago: solo si sigue activo. Nunca inventa un cobro.
  let pago: { tx: string; amount: string; confirmed: boolean } | null = null;
  if (estado === "activo") {
    try {
      const movs = link.asset === "BTC"
        ? await bitcoinMovements(link.address)
        : await baseMovements(link.address);
      const desde = link.createdAt.getTime();
      const match = movs.find((m) => {
        if (m.direction !== "in") return false;
        if (!m.at || new Date(m.at).getTime() < desde) return false;
        if (link.asset !== "BTC" && m.token.toUpperCase() !== link.asset) return false;
        if (link.amount) return Math.abs(Number(m.amount) - Number(link.amount)) < 1e-8;
        return true;
      });
      if (match) {
        pago = { tx: match.explorer, amount: match.amount, confirmed: match.confirmed };
        if (match.confirmed) {
          await db().update(vanlinks)
            .set({ status: "pagado", paidTx: match.explorer, paidAt: new Date() })
            .where(eq(vanlinks.slug, slug));
        }
      }
    } catch {
      // Sin lectura de cadena: se muestra el link igual, sin afirmar nada.
    }
  }

  return NextResponse.json({
    vanlink: {
      slug: link.slug,
      asset: link.asset,
      network: link.network,
      address: link.address,
      amount: link.amount,
      concept: link.concept,
      status: pago?.confirmed ? "pagado" : estado,
      uri: paymentUri(link.asset as AssetKey, link.address, link.amount),
      expiresAt: link.expiresAt,
    },
    pago,
  }, { headers });
}
