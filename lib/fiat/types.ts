/**
 * lib/fiat/types.ts
 * Tipos compartidos de la capa fiat (Onramper) para VanDeFi.
 */

/** Assets permitidos en TODO el flujo fiat. Nada fuera de esta lista. */
export const ALLOWED_ASSETS = ["USDT_BASE", "BTC"] as const;
export type AllowedAsset = (typeof ALLOWED_ASSETS)[number];

/**
 * Códigos de cripto que usa Onramper en sus endpoints (`/supported`,
 * `onlyCryptos`, payload de webhook -> targetCurrency).
 *
 * ASUNCIÓN A VERIFICAR: Onramper identifica activo+red con códigos tipo
 * `USDT_BASE` (sufijo de red). No tengo API key real para confirmarlo contra
 * GET https://api.onramper.com/supported?type=buy&skipCountryCheck=true.
 * Antes de ir a producción, correr esa llamada y ajustar ONRAMPER_ASSET_CODES
 * si el código real difiere (p.ej. podría venir como "usdt_base" en minúsculas
 * o con otro separador).
 */
export const ONRAMPER_ASSET_CODES: Record<AllowedAsset, string> = {
  USDT_BASE: "USDT_BASE",
  BTC: "BTC",
};

export type FiatActivityStatus = "pendiente" | "completado" | "fallido";

/**
 * Mapeo de status de Onramper -> status interno de VanDeFi.
 * Fuente: https://docs.onramper.com/docs/optional-webhook-setup
 * y https://docs.onramper.com/docs/optional-set-up-webhooks
 * Estados documentados: new, pending, paid, completed, canceled, failed.
 * (La doc aclara que algunos providers pueden no emitir todos.)
 */
export function mapOnramperStatus(status: string): FiatActivityStatus {
  switch (status) {
    case "completed":
      return "completado";
    case "failed":
    case "canceled":
      return "fallido";
    case "new":
    case "pending":
    case "paid":
    default:
      return "pendiente";
  }
}

/** Payload del webhook de Onramper (campos documentados). */
export interface OnramperWebhookPayload {
  transactionId: string;
  onrampTransactionId?: string;
  apiKey: string;
  onramp?: string;
  transactionType: "buy" | "sell" | "offramp";
  status: "new" | "pending" | "paid" | "completed" | "canceled" | "failed";
  statusDate: string; // ISO 8601
  statusReason?: string;
  sourceCurrency: string;
  targetCurrency: string;
  inAmount: number;
  outAmount: number;
  partnerFee?: number;
  paymentMethod?: string;
  country?: string;
  walletAddress?: string;
  [key: string]: unknown;
}

/** Fila que persistimos en la tabla de actividad fiat. */
export interface FiatActivityRecord {
  transactionId: string;
  userId: string | null;
  direction: "buy" | "sell";
  asset: string;
  network: string | null;
  status: FiatActivityStatus;
  statusDate: string;
  statusReason: string | null;
  fiatAmount: number | null;
  fiatCurrency: string | null;
  cryptoAmount: number | null;
  walletAddress: string | null;
  raw: OnramperWebhookPayload;
}
