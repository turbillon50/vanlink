/**
 * lib/send/claim-link.ts — "Link de Bitcoin": dinero que viaja dentro de un link.
 *
 * Cómo funciona:
 *  1. El navegador de quien envía genera una llave desechable y su dirección.
 *  2. Quien envía fondea esa dirección desde su wallet (firma normal con Turnkey).
 *  3. La llave va en la parte "#" del link. Esa parte nunca sale del teléfono:
 *     ni WhatsApp al generar la vista previa, ni nuestro servidor la reciben.
 *  4. Quien abre el link pega SU dirección de Bitcoin (p. ej. la de Mercado Pago)
 *     y su propio navegador firma el barrido de TODO el saldo hacia allá.
 *  5. Gastado el saldo, el link queda muerto: no hay nada más que reclamar.
 *
 * VanDeFi nunca tiene la llave, así que nunca custodia el dinero.
 * Riesgo inherente y explícito: quien tenga el link, cobra (como efectivo).
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { address as btcAddress, crypto as btcCrypto } from "bitcoinjs-lib";
import { buildBtcUnsigned, finalizeBtc, planBtcSend, estimateVbytes, type Utxo } from "./bitcoin-tx";

const B64 = { enc: (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0)) };

export type LinkKey = { secret: Uint8Array; address: string; token: string };

export function newLinkKey(): LinkKey {
  const secret = secp256k1.utils.randomSecretKey();
  return fromSecret(secret);
}

function fromSecret(secret: Uint8Array): LinkKey {
  const pub = secp256k1.getPublicKey(secret, true);
  return { secret, address: btcAddress.toBech32(btcCrypto.hash160(pub), 0, "bc"), token: B64.enc(secret) };
}

/** Lee la llave del fragmento del link. null si viene rota o incompleta. */
export function parseLinkToken(token: string): LinkKey | null {
  try {
    const secret = B64.dec(token.trim());
    if (secret.length !== 32 || !secp256k1.utils.isValidSecretKey(secret)) return null;
    return fromSecret(secret);
  } catch { return null; }
}

export const linkUrl = (origin: string, token: string) => `${origin}/c#${token}`;

/** Comisión que se deja apartada para que el que reclama reciba el monto completo. */
export function sweepReserve(feeRate: number) {
  return Math.ceil(estimateVbytes(1, ["p2wpkh"]) * feeRate);
}

/** Barre todo el saldo del link a la dirección destino. Firma aquí mismo, con la llave del link. */
export function sweepLink(key: LinkKey, utxos: Utxo[], to: string, feeRate: number) {
  const plan = planBtcSend({ utxos, to, amount: "max", feeRate, changeAddress: key.address });
  const unsigned = buildBtcUnsigned(plan, key.address);
  const sigs = unsigned.sighashes.map(h => {
    const hash = Uint8Array.from(h.match(/../g)!.map(x => parseInt(x, 16)));
    const b = secp256k1.sign(hash, key.secret, { prehash: false, format: "recovered" });
    const hex = (u: Uint8Array) => Array.from(u, x => x.toString(16).padStart(2, "0")).join("");
    return { v: b[0].toString(16).padStart(2, "0"), r: hex(b.subarray(1, 33)), s: hex(b.subarray(33)) };
  });
  return { plan, ...finalizeBtc(unsigned, sigs) };
}
