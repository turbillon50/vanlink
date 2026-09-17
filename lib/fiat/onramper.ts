/**
 * lib/fiat/onramper.ts
 * Cliente SERVER-ONLY de Onramper para VanDeFi.
 *
 * NUNCA importar este archivo desde un componente cliente ("use client"):
 * usa ONRAMPER_API_KEY y ONRAMPER_WEBHOOK_SECRET, que jamás deben llegar
 * al navegador. Si Next.js se queja de "server-only", es la señal correcta.
 *
 * Arquitectura (no sustituye nada, se conecta encima):
 *   Turnkey = custodia (de ahí sale la dirección destino real del usuario)
 *   Alchemy = RPC
 *   LI.FI   = swaps
 *   Onramper = ESTA capa: fiat on/off-ramp
 */
import "server-only";
import crypto from "node:crypto";
import { ALLOWED_ASSETS, ONRAMPER_ASSET_CODES, type AllowedAsset } from "./types";

const ONRAMPER_API_BASE = "https://api.onramper.com";
const ONRAMPER_WIDGET_BASE = "https://buy.onramper.com";

export interface OnramperEnv {
  apiKey: string | undefined;
  webhookSecret: string | undefined;
  mode: "sandbox" | "production";
  appOrigin: string | undefined;
}

/** Lee el env en el momento de la llamada (nunca cachear en build time). */
export function readOnramperEnv(): OnramperEnv {
  return {
    apiKey: process.env.ONRAMPER_API_KEY,
    webhookSecret: process.env.ONRAMPER_WEBHOOK_SECRET,
    mode: process.env.ONRAMPER_MODE === "production" ? "production" : "sandbox",
    appOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN,
  };
}

export class OnramperNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Onramper no está configurado. Faltan env vars: ${missing.join(", ")}`);
    this.name = "OnramperNotConfiguredError";
  }
}

/**
 * Punto único de "degradación elegante": cualquier función de este módulo
 * que necesite el env llama esto primero. Si falta algo, lanza un error
 * tipado y legible en vez de tronar con un fetch a una URL con
 * "undefined" en el key, o silenciosamente devolver basura.
 */
function requireEnv(): { apiKey: string; webhookSecret: string; mode: "sandbox" | "production" } {
  const env = readOnramperEnv();
  const missing: string[] = [];
  if (!env.apiKey) missing.push("ONRAMPER_API_KEY");
  if (!env.webhookSecret) missing.push("ONRAMPER_WEBHOOK_SECRET");
  if (missing.length > 0) throw new OnramperNotConfiguredError(missing);
  return { apiKey: env.apiKey!, webhookSecret: env.webhookSecret!, mode: env.mode };
}

/** true si hay lo mínimo para operar el buy-widget (no requiere webhook secret). */
export function isOnramperConfigured(): boolean {
  return Boolean(readOnramperEnv().apiKey);
}

// ---------------------------------------------------------------------------
// /supported — activos, y checar si off-ramp está habilitado para la cuenta
// ---------------------------------------------------------------------------

interface SupportedResponse {
  message?: {
    fiat?: Array<{ id?: string; code?: string }>;
    crypto?: Array<{ id?: string; code?: string; network?: string }>;
  };
  // La forma exacta puede variar; guardamos el raw para no perder info.
  [key: string]: unknown;
}

/**
 * Llama GET /supported?type=sell — esta es la verificación REAL contra la
 * API, tal como pide la tarea, antes de construir cualquier pantalla de
 * off-ramp. No asumimos nada: si la llamada falla, o el activo no aparece
 * en la respuesta, off-ramp queda deshabilitado y se reporta por qué.
 *
 * Ref: https://docs.onramper.com/reference/get_supported
 */
export async function checkOfframpAvailability(): Promise<{
  available: boolean;
  reason: string;
  supportedAssets: string[];
}> {
  const { apiKey } = requireEnv();

  let res: Response;
  try {
    res = await fetch(
      `${ONRAMPER_API_BASE}/supported?type=sell&skipCountryCheck=true`,
      {
        method: "GET",
        headers: { Authorization: apiKey },
        cache: "no-store",
      }
    );
  } catch (err) {
    return {
      available: false,
      reason: `No se pudo contactar a Onramper /supported: ${(err as Error).message}`,
      supportedAssets: [],
    };
  }

  if (!res.ok) {
    // 401/403 aquí normalmente significa que la cuenta/API key no tiene
    // sell habilitado, o el key es sandbox sin ese permiso. Se reporta,
    // no se monta la pantalla.
    return {
      available: false,
      reason: `Onramper /supported respondió ${res.status} ${res.statusText} — la cuenta probablemente no tiene off-ramp habilitado, o el modo (${readOnramperEnv().mode}) no lo soporta.`,
      supportedAssets: [],
    };
  }

  const data = (await res.json()) as SupportedResponse;
  const cryptoList = data.message?.crypto ?? [];
  const codes = cryptoList
    .map((c) => c.id ?? c.code ?? "")
    .filter(Boolean)
    .map((c) => c.toUpperCase());

  const missing = ALLOWED_ASSETS.filter(
    (asset) => !codes.includes(ONRAMPER_ASSET_CODES[asset].toUpperCase())
  );

  if (codes.length === 0) {
    return {
      available: false,
      reason: "Onramper /supported (type=sell) no devolvió ningún activo — off-ramp no disponible para esta cuenta.",
      supportedAssets: [],
    };
  }

  if (missing.length > 0) {
    return {
      available: false,
      reason: `Off-ramp disponible en la cuenta, pero sin nuestros activos requeridos (${missing.join(", ")} no aparecen en /supported?type=sell).`,
      supportedAssets: codes,
    };
  }

  return { available: true, reason: "OK", supportedAssets: codes };
}

// ---------------------------------------------------------------------------
// Widget de compra (buy) — SIEMPRE con dirección de Turnkey, nunca a mano
// ---------------------------------------------------------------------------

export interface BuildBuyWidgetUrlParams {
  /** Direcciones REALES de la wallet Turnkey del usuario. Nunca hardcodear. */
  walletAddresses: Partial<Record<AllowedAsset, string>>;
  defaultCrypto?: AllowedAsset;
  defaultFiat?: string; // p.ej. "MXN"
}

/**
 * Construye la URL del widget embebido de compra, restringida a USDT(Base)
 * y BTC, con la wallet del usuario ya inyectada vía el parámetro `wallets`.
 *
 * Ref params: https://docs.onramper.com/docs/supported-widget-parameters
 *
 * IMPORTANTE — lo que EXPLÍCITAMENTE NO hace esta función:
 *  - No firma la URL con Ed25519 (Widget Sign a URL V2). Onramper requiere
 *    eso para bloquear que el usuario edite la wallet/monto en el widget
 *    cuando esos parámetros van en la URL. Firmar V2 necesita una llave
 *    privada Ed25519 propia que NO vino en las credenciales de esta tarea
 *    (solo llegaron ONRAMPER_API_KEY y ONRAMPER_WEBHOOK_SECRET). Mientras
 *    no exista ONRAMPER_SIGNING_PRIVATE_KEY en el env, la wallet viaja sin
 *    firmar — funciona, pero un usuario técnico podría alterar la URL en
 *    el navegador antes de que cargue el iframe. Antes de soltar esto con
 *    dinero real, pedir la llave de firma V2 a Onramper y activar
 *    signBuyWidgetUrlV2() (placeholder abajo).
 */
export function buildBuyWidgetUrl(params: BuildBuyWidgetUrlParams): string {
  const { apiKey } = requireEnv();

  const wallets = ALLOWED_ASSETS.map((asset) => {
    const addr = params.walletAddresses[asset];
    if (!addr) return null;
    return `${ONRAMPER_ASSET_CODES[asset]}:${addr}`;
  }).filter((w): w is string => Boolean(w));

  if (wallets.length === 0) {
    throw new Error(
      "buildBuyWidgetUrl: no se recibió ninguna dirección de wallet Turnkey. " +
        "No se genera la URL — nunca se debe mostrar el widget sin una dirección real."
    );
  }

  const qs = new URLSearchParams();
  qs.set("apiKey", apiKey);
  qs.set("wallets", wallets.join(","));
  qs.set("onlyCryptos", ALLOWED_ASSETS.map((a) => ONRAMPER_ASSET_CODES[a]).join(","));
  if (params.defaultCrypto) qs.set("defaultCrypto", ONRAMPER_ASSET_CODES[params.defaultCrypto]);
  if (params.defaultFiat) qs.set("defaultFiat", params.defaultFiat);

  return `${ONRAMPER_WIDGET_BASE}/?${qs.toString()}`;
}

/**
 * Placeholder documentado para cuando Luis consiga la llave privada Ed25519
 * de firma V2. Implementación exacta según:
 * https://docs.onramper.com/docs/widget-sign-a-url-v2
 * (canonical string de 8 líneas, firma Ed25519, prefijo "v2:", + sigV2,
 * sigV2Timestamp, sigV2Nonce como query params).
 */
export function signBuyWidgetUrlV2(_url: string): string {
  throw new Error(
    "signBuyWidgetUrlV2 no implementado: falta ONRAMPER_SIGNING_PRIVATE_KEY (Ed25519). " +
      "Ver comentario en buildBuyWidgetUrl."
  );
}

// ---------------------------------------------------------------------------
// Verificación de firma del webhook — HMAC-SHA256 sobre el body crudo
// ---------------------------------------------------------------------------

export const ONRAMPER_SIGNATURE_HEADER = "x-onramper-webhook-signature";

/**
 * Verifica la firma del webhook de Onramper.
 * Header: X-Onramper-Webhook-Signature
 * Algoritmo: HMAC-SHA256, hex digest, sobre el body RAW (string, no el
 * objeto ya parseado — si Next.js te da el JSON parseado y re-serializas,
 * la firma puede no matchear por diferencias de formato).
 *
 * Ref: https://docs.onramper.com/docs/optional-webhook-setup
 *      https://docs.onramper.com/docs/optional-set-up-webhooks
 */
export function verifyOnramperWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim(), "utf8");

  // timingSafeEqual exige mismo largo; si no matchea el largo ya es inválida.
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/** Wrapper que ya lee el secret del env (usa esto desde la route real). */
export function verifyOnramperWebhookSignatureFromEnv(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const { webhookSecret } = requireEnv();
  return verifyOnramperWebhookSignature(rawBody, signatureHeader, webhookSecret);
}
