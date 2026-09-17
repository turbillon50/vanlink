"use client";

const OWNER = "vanlink.wallet-device-owner.v1";

export async function clearWalletDevice() {
  const { IndexedDbStamper } = await import("@turnkey/indexed-db-stamper");
  await new IndexedDbStamper().clear();
  localStorage.removeItem(OWNER);
}

export async function prepareWalletDevice(userId: string) {
  const { IndexedDbStamper } = await import("@turnkey/indexed-db-stamper");
  const stamper = new IndexedDbStamper();
  await stamper.init();
  // The P-256 private key remains non-extractable in this browser. Reuse it on
  // a retry so an interrupted request cannot create a second device identity.
  if (localStorage.getItem(OWNER) !== userId || !stamper.getPublicKey()) await stamper.resetKeyPair();
  localStorage.setItem(OWNER, userId);
  const publicKey = stamper.getPublicKey();
  if (!publicKey) throw new Error("Device key unavailable");
  return publicKey;
}

export async function verifyWalletDevice(userId: string, organizationId: string, turnkeyUserId: string) {
  if (localStorage.getItem(OWNER) !== userId) return false;
  const [{ IndexedDbStamper }, { TurnkeyClient }] = await Promise.all([
    import("@turnkey/indexed-db-stamper"), import("@turnkey/http"),
  ]);
  const stamper = new IndexedDbStamper();
  await stamper.init();
  const client = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);
  const identity = await client.getWhoami({ organizationId });
  return identity.organizationId === organizationId && identity.userId === turnkeyUserId;
}

export function walletDeviceOwner() {
  return localStorage.getItem(OWNER);
}

/**
 * Autoriza un segundo dispositivo.
 *
 * Esta función SOLO funciona en el navegador que ya es dueño de la wallet: la
 * actividad se firma con la llave no extraíble que vive en su IndexedDB. Ni el
 * servidor de VanDeFi ni la organización padre pueden hacer esto — el quorum
 * raíz de la sub-organización tiene un único miembro, que es el usuario.
 */
export async function authorizeSecondDevice(params: {
  organizationId: string;
  turnkeyUserId: string;
  publicKey: string;
  label: string;
}) {
  const [{ IndexedDbStamper }, { TurnkeyClient }] = await Promise.all([
    import("@turnkey/indexed-db-stamper"),
    import("@turnkey/http"),
  ]);

  const stamper = new IndexedDbStamper();
  await stamper.init();
  const client = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);

  // Comprobación previa: este navegador debe ser el dueño real, no solo creerlo.
  const identity = await client.getWhoami({ organizationId: params.organizationId });
  if (identity.organizationId !== params.organizationId || identity.userId !== params.turnkeyUserId) {
    throw new Error("Este dispositivo no está autorizado para aprobar otro.");
  }

  const result = await client.createApiKeys({
    type: "ACTIVITY_TYPE_CREATE_API_KEYS_V2",
    organizationId: params.organizationId,
    timestampMs: String(Date.now()),
    parameters: {
      userId: params.turnkeyUserId,
      apiKeys: [{
        apiKeyName: params.label.slice(0, 40),
        publicKey: params.publicKey,
        curveType: "API_KEY_CURVE_P256",
        // Sin expiración: es un dispositivo del usuario, no una sesión.
      }],
    },
  });

  return result;
}

/**
 * Verificación de seguridad para el dispositivo NUEVO: confirma que su llave
 * ya quedó registrada antes de decirle al usuario que está listo.
 */
export async function confirmDeviceAuthorized(organizationId: string, turnkeyUserId: string) {
  const [{ IndexedDbStamper }, { TurnkeyClient }] = await Promise.all([
    import("@turnkey/indexed-db-stamper"),
    import("@turnkey/http"),
  ]);
  const stamper = new IndexedDbStamper();
  await stamper.init();
  const client = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);
  const identity = await client.getWhoami({ organizationId });
  return identity.organizationId === organizationId && identity.userId === turnkeyUserId;
}
