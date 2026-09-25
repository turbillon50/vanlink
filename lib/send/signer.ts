"use client";
/**
 * lib/send/signer.ts — firma en el NAVEGADOR con la llave del dispositivo.
 *
 * La llave P-256 del dispositivo vive en IndexedDB y no se puede extraer.
 * Con ella se sella cada petición a Turnkey; Turnkey firma con la llave de la
 * wallet dentro de su enclave. Ni el servidor de VanDeFi ni nadie más puede
 * producir estas firmas: por eso la wallet es no custodiada.
 */
type Activity = { id: string; status: string; result?: Record<string, unknown>; failure?: { message?: string } };

async function client() {
  const [{ IndexedDbStamper }, { TurnkeyClient }] = await Promise.all([
    import("@turnkey/indexed-db-stamper"), import("@turnkey/http"),
  ]);
  const stamper = new IndexedDbStamper();
  await stamper.init();
  if (!stamper.getPublicKey()) throw new Error("dispositivo_no_autorizado");
  return new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);
}

/** Espera a que la actividad termine (normalmente ya viene completa). */
async function settle(c: Awaited<ReturnType<typeof client>>, organizationId: string, activity: Activity): Promise<Activity> {
  let a = activity;
  for (let i = 0; i < 20 && ["ACTIVITY_STATUS_CREATED", "ACTIVITY_STATUS_PENDING"].includes(a.status); i++) {
    await new Promise(r => setTimeout(r, 500));
    a = (await c.getActivity({ organizationId, activityId: a.id })).activity as unknown as Activity;
  }
  if (a.status !== "ACTIVITY_STATUS_COMPLETED") {
    throw new Error(a.status === "ACTIVITY_STATUS_CONSENSUS_NEEDED" ? "requiere_aprobacion" : (a.failure?.message || "firma_rechazada"));
  }
  return a;
}

export async function signBitcoinHashes(organizationId: string, bitcoinAddress: string, sighashes: string[]) {
  const c = await client();
  const res = await c.signRawPayloads({
    type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOADS", organizationId, timestampMs: String(Date.now()),
    parameters: { signWith: bitcoinAddress, payloads: sighashes,
      encoding: "PAYLOAD_ENCODING_HEXADECIMAL", hashFunction: "HASH_FUNCTION_NO_OP" },
  });
  const a = await settle(c, organizationId, res.activity as unknown as Activity);
  const sigs = (a.result as { signRawPayloadsResult?: { signatures?: { r: string; s: string; v: string }[] } })
    ?.signRawPayloadsResult?.signatures;
  if (!sigs || sigs.length !== sighashes.length) throw new Error("firmas_incompletas");
  return sigs;
}

export async function signBaseTransaction(organizationId: string, evmAddress: string, unsigned: string) {
  const c = await client();
  const res = await c.signTransaction({
    type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2", organizationId, timestampMs: String(Date.now()),
    parameters: { signWith: evmAddress, unsignedTransaction: unsigned.replace(/^0x/, ""), type: "TRANSACTION_TYPE_ETHEREUM" },
  });
  const a = await settle(c, organizationId, res.activity as unknown as Activity);
  const signed = (a.result as { signTransactionResult?: { signedTransaction?: string } })?.signTransactionResult?.signedTransaction;
  if (!signed) throw new Error("firma_vacia");
  return signed;
}
