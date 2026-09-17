/**
 * lib/wallet/export.ts — exportación de la wallet. SOLO NAVEGADOR.
 *
 * Cómo funciona y por qué es seguro:
 *  1. Este navegador genera un par de llaves efímero (targetPublicKey).
 *  2. El dispositivo AUTORIZADO firma la actividad EXPORT_WALLET.
 *  3. Turnkey devuelve un "export bundle" CIFRADO contra esa llave pública.
 *  4. El bundle se descifra aquí mismo y salen las palabras.
 *
 * Consecuencia: ni el servidor de VanDeFi ni Turnkey ven nunca la frase
 * semilla. Por eso esta función no puede vivir en el servidor: si viviera
 * ahí, VanDeFi sí podría leerla, y dejaría de ser no custodiada.
 */

export async function exportWalletMnemonic(params: {
  organizationId: string;
  walletId: string;
}): Promise<string> {
  const [{ IndexedDbStamper }, { TurnkeyClient }, iframeMod] = await Promise.all([
    import("@turnkey/indexed-db-stamper"),
    import("@turnkey/http"),
    import("@turnkey/crypto"),
  ]);

  const stamper = new IndexedDbStamper();
  await stamper.init();
  const client = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);

  // Par efímero: la privada vive en memoria y muere al terminar.
  const keyPair = iframeMod.generateP256KeyPair();

  const activity = await client.exportWallet({
    type: "ACTIVITY_TYPE_EXPORT_WALLET",
    organizationId: params.organizationId,
    timestampMs: String(Date.now()),
    parameters: {
      walletId: params.walletId,
      targetPublicKey: keyPair.publicKeyUncompressed,
    },
  });

  const bundle = activity.activity?.result?.exportWalletResult?.exportBundle;
  if (!bundle) throw new Error("Turnkey no devolvió el paquete de exportación.");

  // El descifrado ocurre aquí, en el navegador del usuario.
  const mnemonic = await iframeMod.decryptExportBundle({
    exportBundle: bundle,
    embeddedKey: keyPair.privateKey,
    organizationId: params.organizationId,
    returnMnemonic: true,
  });

  return mnemonic;
}
