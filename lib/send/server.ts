/**
 * lib/send/server.ts — lo que el servidor sí hace en un envío: LEER la red,
 * cotizar comisiones y TRANSMITIR transacciones ya firmadas. Nunca firma.
 *
 * Solo transmite transacciones cuyo remitente es la wallet del usuario que
 * hace la petición, para que la API no sirva de relevo a terceros.
 */
import "server-only";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { Transaction, crypto as btcCrypto } from "bitcoinjs-lib";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { baseRpc } from "@/lib/chain/rpc";
import { outputScript, type Utxo, type BtcFeeRates } from "./bitcoin-tx";

export const noStore = { "Cache-Control": "no-store" };

export class SendError extends Error {
  constructor(public code: string, public status = 400, message?: string) { super(message ?? code); }
}

export async function currentWallet() {
  const { userId } = await auth();
  if (!userId) throw new SendError("no_autenticado", 401, "Inicia sesión para enviar.");
  if (!process.env.DATABASE_URL) throw new SendError("sin_base", 503, "La wallet no está disponible.");
  const wallet = (await db().select().from(wallets).where(eq(wallets.clerkUserId, userId)))[0];
  if (!wallet) throw new SendError("sin_wallet", 404, "Primero activa tu wallet.");
  return wallet;
}

export function errorResponse(e: unknown) {
  if (e instanceof SendError) return Response.json({ error: e.code, message: e.message }, { status: e.status, headers: noStore });
  console.error("[send]", (e as Error)?.message);
  return Response.json({ error: "error_red", message: "La red no respondió. Intenta de nuevo." }, { status: 502, headers: noStore });
}

/* ---------------- Bitcoin ---------------- */

const ESPLORA = [process.env.BITCOIN_API_URL, "https://mempool.space/api", "https://blockstream.info/api"]
  .filter(Boolean) as string[];

export async function esplora<T>(path: string, init?: RequestInit, as: "json" | "text" = "json"): Promise<T> {
  let last: Error | undefined;
  for (const base of ESPLORA) {
    try {
      const r = await fetch(base + path, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const body = await r.text();
      if (!r.ok) {
        // Un rechazo de la red (tx inválida) no se reintenta en otro proveedor: diría lo mismo.
        if (init?.method === "POST" && r.status === 400) throw new SendError("btc_rechazada", 400, body.slice(0, 200));
        throw new Error(`esplora_${r.status}`);
      }
      return (as === "json" ? JSON.parse(body) : body) as T;
    } catch (e) {
      if (e instanceof SendError) throw e;
      last = e as Error;
    }
  }
  throw last ?? new Error("esplora_sin_proveedor");
}

export async function btcUtxos(address: string) {
  const raw = await esplora<{ txid: string; vout: number; value: number; status: { confirmed: boolean } }[]>(`/address/${address}/utxo`);
  const confirmed: Utxo[] = raw.filter(u => u.status.confirmed).map(({ txid, vout, value }) => ({ txid, vout, value }));
  const pendingSats = raw.filter(u => !u.status.confirmed).reduce((n, u) => n + u.value, 0);
  return { utxos: confirmed, pendingSats };
}

export async function btcFees(): Promise<BtcFeeRates> {
  try {
    const f = await fetch("https://mempool.space/api/v1/fees/recommended", { cache: "no-store", signal: AbortSignal.timeout(8_000) })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); }) as Record<string, number>;
    return { fastest: f.fastestFee, halfHour: f.halfHourFee, hour: f.hourFee, economy: f.economyFee, minimum: Math.max(1, f.minimumFee) };
  } catch {
    const e = await esplora<Record<string, number>>("/fee-estimates");
    const pick = (k: string) => Math.max(1, Math.ceil(e[k] ?? 1));
    return { fastest: pick("1"), halfHour: pick("3"), hour: pick("6"), economy: pick("144"), minimum: 1 };
  }
}

/** Solo retransmite si TODAS las entradas las firmó la llave de la wallet del usuario. */
export async function btcBroadcast(hex: string, bitcoinAddress: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length > 200_000) throw new SendError("tx_invalida");
  let tx: Transaction;
  try { tx = Transaction.fromHex(hex); } catch { throw new SendError("tx_invalida"); }
  const pkh = Buffer.from(outputScript(bitcoinAddress).script.slice(2)).toString("hex");
  for (const input of tx.ins) {
    const pub = input.witness?.[1];
    if (!pub || Buffer.from(btcCrypto.hash160(pub)).toString("hex") !== pkh) throw new SendError("tx_ajena", 403, "Esa transacción no es de tu wallet.");
  }
  const txid = (await esplora<string>("/tx", { method: "POST", body: hex, headers: { "Content-Type": "text/plain" } }, "text")).trim();
  if (txid !== tx.getId()) throw new SendError("txid_inesperado", 502);
  return txid;
}

export async function btcStatus(txid: string) {
  const s = await esplora<{ confirmed: boolean; block_height?: number; block_time?: number }>(`/tx/${txid}/status`);
  return { confirmed: s.confirmed, block: s.block_height ?? null, at: s.block_time ? new Date(s.block_time * 1000).toISOString() : null };
}

/* ---------------- Base ---------------- */

const hexNum = (h: string) => BigInt(h === "0x" ? "0x0" : h);

export async function baseQuote(params: { from: string; to: string; value: bigint; data?: string }) {
  const [nonceHex, tipHex, block, ethHex] = await Promise.all([
    baseRpc("eth_getTransactionCount", [params.from, "pending"]),
    baseRpc("eth_maxPriorityFeePerGas", []).catch(() => "0x186a0"),
    fetchBaseFee(),
    baseRpc("eth_getBalance", [params.from, "latest"]),
  ]);
  let gas: bigint;
  try {
    gas = hexNum(await baseRpc("eth_estimateGas", [{ from: params.from, to: params.to,
      value: "0x" + params.value.toString(16), ...(params.data ? { data: params.data } : {}) }]));
  } catch (e) {
    const msg = String((e as Error).message || "").toLowerCase();
    if (msg.includes("exceeds balance") || msg.includes("insufficient")) throw new SendError("saldo_insuficiente", 400, "No tienes saldo suficiente para ese monto.");
    throw new SendError("simulacion_fallo", 400, "La red rechazó el envío en la simulación. Revisa monto y dirección.");
  }
  const tip = hexNum(tipHex) > BigInt(0) ? hexNum(tipHex) : BigInt(100_000);
  // Margen: 20% más gas del estimado y el doble del base fee para que no se atore.
  return {
    nonce: Number(hexNum(nonceHex)),
    gas: ((gas * BigInt(120)) / BigInt(100)).toString(),
    maxPriorityFeePerGas: tip.toString(),
    maxFeePerGas: (block * BigInt(2) + tip).toString(),
    ethBalance: hexNum(ethHex).toString(),
  };
}

async function fetchBaseFee(): Promise<bigint> {
  const r = await fetch(process.env.BASE_RPC_URL || "https://mainnet.base.org", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["latest", false] }),
  });
  const d = (await r.json()) as { result?: { baseFeePerGas?: string } };
  return hexNum(d.result?.baseFeePerGas ?? "0x989680");
}

export async function tokenBalanceRaw(token: string, owner: string) {
  return hexNum(await baseRpc("eth_call", [{ to: token, data: "0x70a08231" + owner.slice(2).toLowerCase().padStart(64, "0") }, "latest"]));
}

export async function baseBroadcast(signed: string) {
  return baseRpc("eth_sendRawTransaction", [signed]).catch(e => {
    const m = String((e as Error).message || "");
    if (/nonce too low|already known/i.test(m)) throw new SendError("ya_enviada", 409, "Esa transacción ya se había enviado.");
    if (/insufficient funds/i.test(m)) throw new SendError("sin_gas", 400, "No tienes ETH suficiente para la comisión.");
    throw new SendError("base_rechazada", 400, m.slice(0, 160) || "La red rechazó la transacción.");
  });
}

export async function baseStatus(hash: string) {
  const res = await fetch(process.env.BASE_RPC_URL || "https://mainnet.base.org", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }),
  });
  const r = ((await res.json()) as { result?: unknown }).result;
  if (!r || typeof r !== "object") return { confirmed: false, failed: false, block: null };
  const rec = r as { status?: string; blockNumber?: string };
  return { confirmed: rec.status === "0x1", failed: rec.status === "0x0", block: rec.blockNumber ? Number(hexNum(rec.blockNumber)) : null };
}

/* ---------------- Link de Bitcoin (público, sin sesión) ---------------- */

/** Estado de una dirección de link: saldo gastable (incluye sin confirmar) y si ya se usó. */
export async function linkState(address: string) {
  const [utxos, info, fees] = await Promise.all([
    esplora<{ txid: string; vout: number; value: number; status: { confirmed: boolean } }[]>(`/address/${address}/utxo`),
    esplora<{ chain_stats: { tx_count: number }; mempool_stats: { tx_count: number } }>(`/address/${address}`),
    btcFees(),
  ]);
  const txCount = info.chain_stats.tx_count + info.mempool_stats.tx_count;
  return {
    utxos: utxos.map(({ txid, vout, value }) => ({ txid, vout, value })),
    unconfirmed: utxos.some(u => !u.status.confirmed),
    balance: utxos.reduce((n, u) => n + u.value, 0),
    status: utxos.length ? "disponible" : txCount > 0 ? "reclamado" : "sin_fondos",
    fees,
  };
}

/** Transmite un barrido de link ya firmado. Solo acepta transacciones P2WPKH pequeñas y válidas. */
export async function linkBroadcast(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length > 20_000) throw new SendError("tx_invalida");
  let tx: Transaction;
  try { tx = Transaction.fromHex(hex); } catch { throw new SendError("tx_invalida"); }
  if (tx.outs.length !== 1 || tx.ins.some(i => i.witness?.length !== 2)) throw new SendError("tx_invalida");
  const txid = (await esplora<string>("/tx", { method: "POST", body: hex, headers: { "Content-Type": "text/plain" } }, "text")).trim();
  if (txid !== tx.getId()) throw new SendError("txid_inesperado", 502);
  return txid;
}
