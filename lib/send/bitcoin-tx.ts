/**
 * lib/send/bitcoin-tx.ts — armado de transacciones de Bitcoin nativo (P2WPKH).
 *
 * Código puro: corre igual en el navegador y en las pruebas. NO firma nada.
 * La firma la hace Turnkey con la llave del dispositivo autorizado; aquí solo
 * se calculan los hashes a firmar y se ensambla la transacción con las firmas.
 *
 * Candados:
 *  - Nunca se crea una salida por debajo del límite de polvo (dust).
 *  - Si el cambio sería polvo, se suma a la comisión en vez de perderse raro.
 *  - Cada firma se verifica contra la llave pública ANTES de transmitir, y la
 *    llave pública debe corresponder a la dirección de origen.
 */
import { Transaction, address as btcAddress, crypto as btcCrypto, script as btcScript } from "bitcoinjs-lib";
import { secp256k1 } from "@noble/curves/secp256k1.js";

export type Utxo = { txid: string; vout: number; value: number };
export type BtcFeeRates = { fastest: number; halfHour: number; hour: number; economy: number; minimum: number };

export const DUST_P2WPKH = 294;
export const DUST_GENERIC = 546;
const SIGHASH_ALL = Transaction.SIGHASH_ALL;
const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");

const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
function unhex(h: string): Uint8Array {
  const c = h.startsWith("0x") ? h.slice(2) : h;
  if (c.length % 2 || /[^0-9a-f]/i.test(c)) throw new Error("hex_invalido");
  const out = new Uint8Array(c.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16);
  return out;
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** Script de salida para cualquier dirección mainnet (P2PKH, P2SH, P2WPKH, P2WSH, P2TR). */
export function outputScript(addr: string): { script: Uint8Array; kind: "p2pkh" | "p2sh" | "p2wpkh" | "p2wsh" | "p2tr" } {
  const a = addr.trim();
  if (/^bc1/i.test(a)) {
    const d = btcAddress.fromBech32(a.toLowerCase());
    if (d.prefix !== "bc") throw new Error("red_incorrecta");
    const data = Uint8Array.from(d.data);
    if (d.version === 0 && data.length === 20) return { script: concat(Uint8Array.of(0x00, 0x14), data), kind: "p2wpkh" };
    if (d.version === 0 && data.length === 32) return { script: concat(Uint8Array.of(0x00, 0x20), data), kind: "p2wsh" };
    if (d.version === 1 && data.length === 32) return { script: concat(Uint8Array.of(0x51, 0x20), data), kind: "p2tr" };
    throw new Error("direccion_no_soportada");
  }
  const d = btcAddress.fromBase58Check(a);
  const hash = Uint8Array.from(d.hash);
  if (d.version === 0x00) return { script: concat(Uint8Array.of(0x76, 0xa9, 0x14), hash, Uint8Array.of(0x88, 0xac)), kind: "p2pkh" };
  if (d.version === 0x05) return { script: concat(Uint8Array.of(0xa9, 0x14), hash, Uint8Array.of(0x87)), kind: "p2sh" };
  throw new Error("red_incorrecta");
}

export function isValidBtcAddress(addr: string): boolean {
  try { outputScript(addr); return true; } catch { return false; }
}

const OUTPUT_VBYTES = { p2pkh: 34, p2sh: 32, p2wpkh: 31, p2wsh: 43, p2tr: 43 } as const;
/** Tamaño virtual: 10.5 de encabezado + 68 por entrada P2WPKH + salidas. */
export function estimateVbytes(inputs: number, outputs: (keyof typeof OUTPUT_VBYTES)[]): number {
  return Math.ceil(10.5 + inputs * 68 + outputs.reduce((n, k) => n + OUTPUT_VBYTES[k], 0));
}

export type BtcPlan = {
  inputs: Utxo[]; to: string; amount: number; change: number; fee: number; vbytes: number; feeRate: number;
};

/**
 * Elige entradas (mayores primero) y calcula comisión y cambio.
 * amount = "max" vacía la wallet: todo menos la comisión, sin cambio.
 */
export function planBtcSend(params: { utxos: Utxo[]; to: string; amount: number | "max"; feeRate: number; changeAddress: string }): BtcPlan {
  const { utxos, to, feeRate, changeAddress } = params;
  const dest = outputScript(to).kind;
  outputScript(changeAddress);
  if (!(feeRate >= 1) || !Number.isFinite(feeRate)) throw new Error("comision_invalida");
  const dust = dest === "p2wpkh" ? DUST_P2WPKH : DUST_GENERIC;
  const sorted = [...utxos].filter(u => u.value > 0).sort((a, b) => b.value - a.value);
  if (!sorted.length) throw new Error("sin_fondos");

  if (params.amount === "max") {
    const vbytes = estimateVbytes(sorted.length, [dest]);
    const fee = Math.ceil(vbytes * feeRate);
    const total = sorted.reduce((n, u) => n + u.value, 0);
    const amount = total - fee;
    if (amount < dust) throw new Error("fondos_insuficientes_para_comision");
    return { inputs: sorted, to, amount, change: 0, fee, vbytes, feeRate };
  }

  const amount = Math.round(params.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("monto_invalido");
  if (amount < dust) throw new Error("monto_bajo_polvo");
  const chosen: Utxo[] = [];
  let sum = 0;
  for (const u of sorted) {
    chosen.push(u); sum += u.value;
    const withChange = Math.ceil(estimateVbytes(chosen.length, [dest, "p2wpkh"]) * feeRate);
    if (sum - amount - withChange >= DUST_P2WPKH) {
      return { inputs: chosen, to, amount, change: sum - amount - withChange, fee: withChange,
        vbytes: estimateVbytes(chosen.length, [dest, "p2wpkh"]), feeRate };
    }
    const noChangeVb = estimateVbytes(chosen.length, [dest]);
    const noChange = Math.ceil(noChangeVb * feeRate);
    if (sum - amount >= noChange) {
      // El sobrante no alcanza para una salida de cambio: se va a comisión.
      return { inputs: chosen, to, amount, change: 0, fee: sum - amount, vbytes: noChangeVb, feeRate };
    }
  }
  throw new Error("fondos_insuficientes");
}

function reverse(h: string) { return unhex(h).reverse(); }

/** Transacción sin firmas + los hashes (BIP143) que Turnkey debe firmar, uno por entrada. */
export function buildBtcUnsigned(plan: BtcPlan, fromAddress: string) {
  const from = outputScript(fromAddress);
  if (from.kind !== "p2wpkh") throw new Error("origen_no_p2wpkh");
  const pkh = from.script.slice(2);
  const tx = new Transaction();
  tx.version = 2;
  for (const u of plan.inputs) tx.addInput(reverse(u.txid), u.vout, 0xfffffffd); // RBF habilitado
  tx.addOutput(outputScript(plan.to).script, BigInt(plan.amount));
  if (plan.change > 0) tx.addOutput(from.script, BigInt(plan.change));
  const scriptCode = concat(Uint8Array.of(0x76, 0xa9, 0x14), pkh, Uint8Array.of(0x88, 0xac));
  const sighashes = plan.inputs.map((u, i) => hex(tx.hashForWitnessV0(i, scriptCode, BigInt(u.value), SIGHASH_ALL)));
  return { tx, sighashes, pkh };
}

/** r,s,v de Turnkey → firma normalizada (low-S) + llave pública recuperada. */
export function recoverSigner(sighash: string, sig: { r: string; s: string; v: string }) {
  const r = BigInt("0x" + sig.r.replace(/^0x/, ""));
  let s = BigInt("0x" + sig.s.replace(/^0x/, ""));
  let recovery = parseInt(sig.v, 16) % 2;
  if (s > N / BigInt(2)) { s = N - s; recovery ^= 1; }
  const compact = unhex(r.toString(16).padStart(64, "0") + s.toString(16).padStart(64, "0"));
  const msg = unhex(sighash);
  const recovered = secp256k1.Signature.fromBytes(compact, "compact").addRecoveryBit(recovery).recoverPublicKey(msg);
  const pubkey = recovered.toBytes(true);
  if (!secp256k1.verify(compact, msg, pubkey, { prehash: false, format: "compact" })) throw new Error("firma_invalida");
  return { compact, pubkey };
}

/** Ensambla testigos y devuelve el hex listo para transmitir. Verifica todo antes. */
export function finalizeBtc(unsigned: ReturnType<typeof buildBtcUnsigned>, signatures: { r: string; s: string; v: string }[]) {
  const { tx, sighashes, pkh } = unsigned;
  if (signatures.length !== sighashes.length) throw new Error("firmas_incompletas");
  sighashes.forEach((h, i) => {
    const { compact, pubkey } = recoverSigner(h, signatures[i]);
    if (hex(btcCrypto.hash160(pubkey)) !== hex(pkh)) throw new Error("llave_no_corresponde_a_origen");
    const der = btcScript.signature.encode(compact, SIGHASH_ALL);
    tx.setWitness(i, [der, pubkey]);
  });
  return { hex: tx.toHex(), txid: tx.getId(), vsize: tx.virtualSize() };
}

export const satsToBtc = (sats: number) => (sats / 1e8).toFixed(8).replace(/\.?0+$/, "") || "0";
export function btcToSats(input: string): number | null {
  const v = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,8})?$/.test(v)) return null;
  const [w, f = ""] = v.split(".");
  const sats = Number(w) * 1e8 + Number((f + "00000000").slice(0, 8));
  return Number.isSafeInteger(sats) && sats > 0 ? sats : null;
}
