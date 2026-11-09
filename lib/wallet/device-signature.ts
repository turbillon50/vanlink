"use client";

import { getAddress, hashMessage, recoverMessageAddress, type Hex } from "viem";
import { existingWalletDeviceStamper } from "@/lib/wallet/browser";

type WalletIdentity = { organizationId: string; turnkeyUserId: string; evmAddress: string };
type Activity = {
  id: string; status: string; organizationId?: string;
  result?: { signRawPayloadResult?: { r?: unknown; s?: unknown; v?: unknown } };
};

function signaturePart(value: unknown): Hex {
  if (typeof value !== "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("firma_invalida");
  }
  return ("0x" + value.replace(/^0x/, "")) as Hex;
}

/** A diagnostic message only: no transaction, approval, session or reusable login proof. */
export async function checkWalletSignature(identity: WalletIdentity): Promise<{ verified: true; checkedAt: string }> {
  if (typeof window === "undefined") throw new Error("solo_navegador");
  if (!globalThis.crypto?.getRandomValues) throw new Error("sin_criptografia_segura");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(identity.organizationId) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(identity.turnkeyUserId) ||
      !/^0x[0-9a-fA-F]{40}$/.test(identity.evmAddress)) throw new Error("dispositivo_identidad_incorrecta");
  const address = getAddress(identity.evmAddress);
  // This getter explicitly prevents SDK init() from creating/resetting a missing key.
  const stamper = await existingWalletDeviceStamper();
  if (!stamper?.getPublicKey()) throw new Error("dispositivo_no_autorizado");
  const { TurnkeyClient } = await import("@turnkey/http");
  const client = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);
  let whoami;
  try { whoami = await client.getWhoami({ organizationId: identity.organizationId }); }
  catch { throw new Error("dispositivo_no_autorizado"); }
  if (whoami.organizationId !== identity.organizationId || whoami.userId !== identity.turnkeyUserId) {
    throw new Error("dispositivo_identidad_incorrecta");
  }

  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const issuedAt = new Date().toISOString();
  const message = [
    "VanDeFi: comprobación de firma del dispositivo",
    "Solo diagnóstico. No autoriza transferencias, contratos, sesiones ni acceso a fondos.",
    "Wallet: " + address,
    "Organización: " + identity.organizationId,
    "Usuario Turnkey: " + identity.turnkeyUserId,
    "Fecha: " + issuedAt,
    "Nonce: " + nonce,
  ].join("\n");
  // EIP-191 includes the Ethereum signed-message prefix. Turnkey signs only its digest.
  let activity: Activity;
  try {
    activity = (await client.signRawPayload({
      type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
      organizationId: identity.organizationId,
      timestampMs: String(Date.now()),
      parameters: { signWith: address, payload: hashMessage(message).slice(2),
        encoding: "PAYLOAD_ENCODING_HEXADECIMAL", hashFunction: "HASH_FUNCTION_NO_OP" },
    })).activity as unknown as Activity;
    for (let i = 0; i < 20 && ["ACTIVITY_STATUS_CREATED", "ACTIVITY_STATUS_PENDING"].includes(activity.status); i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      activity = (await client.getActivity({ organizationId: identity.organizationId, activityId: activity.id })).activity as unknown as Activity;
    }
  } catch { throw new Error("firma_rechazada"); }
  if (activity.organizationId && activity.organizationId !== identity.organizationId) throw new Error("firma_invalida");
  if (activity.status !== "ACTIVITY_STATUS_COMPLETED") {
    throw new Error(activity.status === "ACTIVITY_STATUS_CONSENSUS_NEEDED" ? "requiere_aprobacion" : "firma_rechazada");
  }
  const result = activity.result?.signRawPayloadResult;
  const r = signaturePart(result?.r);
  const s = signaturePart(result?.s);
  const recovery = typeof result?.v === "string" ? result.v.replace(/^0x/, "").toLowerCase() : "";
  const v = ["0", "00", "27", "1b"].includes(recovery) ? BigInt(27) :
    ["1", "01", "28", "1c"].includes(recovery) ? BigInt(28) : null;
  if (v === null) throw new Error("firma_invalida");
  let recovered: string;
  try { recovered = await recoverMessageAddress({ message, signature: { r, s, v } }); }
  catch { throw new Error("firma_invalida"); }
  if (recovered.toLowerCase() !== address.toLowerCase()) throw new Error("firma_wallet_incorrecta");
  // Raw signature and message stay in this invocation; neither is returned or persisted.
  return { verified: true, checkedAt: new Date().toISOString() };
}
