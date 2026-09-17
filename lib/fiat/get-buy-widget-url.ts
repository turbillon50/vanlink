/**
 * lib/fiat/get-buy-widget-url.ts
 * SERVER-ONLY. Junta la dirección real de Turnkey del usuario con
 * buildBuyWidgetUrl(). Este es el ÚNICO lugar donde debería armarse la URL
 * del widget de compra — así nunca hay una dirección escrita a mano en
 * ningún componente cliente.
 *
 * INTEGRACIÓN PENDIENTE: no tengo el path real del cliente de Turnkey en
 * tu repo (algo como lib/turnkey/wallets.ts). Sustituye getTurnkeyAddresses
 * por la llamada real — la dejé como función a importar con una firma
 * clara para que sea un cambio de una línea.
 */
import "server-only";
import { buildBuyWidgetUrl } from "./onramper";
import type { AllowedAsset } from "./types";

// TODO(integración): reemplazar por el import real, p.ej.:
// import { getTurnkeyAddressesForUser } from "@/lib/turnkey/wallets";
async function getTurnkeyAddresses(
  _userId: string
): Promise<Partial<Record<AllowedAsset, string>>> {
  throw new Error(
    "getTurnkeyAddresses no está conectado a Turnkey todavía. " +
      "Wire esto a tu custodia real antes de usar getBuyWidgetUrlForUser — " +
      "NUNCA se debe caer a una dirección hardcodeada o de prueba en producción."
  );
}

export async function getBuyWidgetUrlForUser(
  userId: string,
  opts?: { defaultCrypto?: AllowedAsset; defaultFiat?: string }
): Promise<string> {
  const walletAddresses = await getTurnkeyAddresses(userId);
  return buildBuyWidgetUrl({
    walletAddresses,
    defaultCrypto: opts?.defaultCrypto,
    defaultFiat: opts?.defaultFiat ?? "MXN",
  });
}
