# Onramper en VanDeFi — handoff

Código real, escrito y **probado en ejecución** (no solo redactado). Lo que
NO se pudo probar contra servicios reales está marcado abajo con la causa
exacta — no por falta de intento, sino porque las credenciales que llegaron
son placeholders (`<pega>`) y esta sesión no tiene acceso a
`/root/codex-work/vanlink` ni al Neon de producción.

## Archivos (van directo al repo, mismas rutas)

```
lib/fiat/types.ts                    tipos + mapeo de status Onramper->interno
lib/fiat/onramper.ts                 cliente server-only (supported/, webhook verify, widget URL)
lib/fiat/activity-store.ts           persistencia idempotente en Neon
lib/fiat/get-buy-widget-url.ts       junta Turnkey + Onramper (integración pendiente, ver abajo)
app/api/onramp/webhook/route.ts      handler del webhook
app/api/onramp/activity/route.ts     endpoint para la pantalla de Actividad
components/fiat/BuyWidget.tsx        iframe del widget de compra
components/fiat/SellGate.tsx         gate de off-ramp (verifica API antes de montar)
migrations/2026_add_fiat_activity.sql  tablas nuevas en Neon
scripts/test-webhook-signature.mts   prueba real de firma (ver salida abajo)
```

## Los 8 puntos, uno por uno

**1. `lib/fiat/onramper.ts` server-only** — hecho. Usa `import "server-only"`
para que Next.js truene si algún día alguien lo importa desde un client
component.

**2. Widget embebido con dirección de Turnkey, nunca a mano** — hecho en
`buildBuyWidgetUrl()` + `get-buy-widget-url.ts`: si no hay dirección real,
la función **lanza error**, no genera URL con nada inventado. Lo que falta:
`getTurnkeyAddresses()` es un stub que también lanza error a propósito —
no conozco el path real de tu cliente Turnkey en el repo. Es cambiar un
import, la firma ya está lista.

**3. Webhook con verificación de firma + idempotencia** — hecho y
**probado de verdad** (salida abajo). Firma: HMAC-SHA256 sobre el body
crudo, header `X-Onramper-Webhook-Signature` (así lo documenta Onramper:
[Webhook Setup](https://docs.onramper.com/docs/optional-webhook-setup),
[Set up webhooks](https://docs.onramper.com/docs/optional-set-up-webhooks)).
Idempotencia en dos niveles: hash del body exacto (reintentos idénticos) +
upsert por `transactionId` que no deja que un status viejo pise uno nuevo
si llegan desordenados.

**4. Pantalla de Actividad con estado real** — el endpoint
`app/api/onramp/activity/route.ts` ya lee de la tabla real. Falta
conectarlo a TU pantalla de Actividad existente — no sé su path, no
existe en lo que me llegó.

**5. Off-ramp solo si la cuenta lo tiene habilitado, verificado contra la
API** — hecho en `checkOfframpAvailability()`: pega a
`GET https://api.onramper.com/supported?type=sell&skipCountryCheck=true`
de verdad (no lo asume), y si no responde bien o no trae USDT_BASE/BTC,
`SellGate.tsx` no monta nada y solo reporta el motivo exacto.
**No se pudo ejecutar contra la API real** — el `ONRAMPER_API_KEY` que
llegó es literalmente `<pega>`, no una key. En cuanto la tengas, corre
esto una vez y me dices qué contestó:
```
curl -s https://api.onramper.com/supported?type=sell\&skipCountryCheck=true -H "Authorization: TU_API_KEY"
```

**6. Restringido a USDT (Base) y BTC** — `ALLOWED_ASSETS` en `types.ts` es
la única lista, se usa en el widget (`onlyCryptos`) y en el check de
off-ramp. Ojo con un detalle real: el código que usa Onramper para
"USDT en Base" (`USDT_BASE` aquí) es una suposición razonable pero **sin
confirmar** — no tengo API key para pegarle a `/supported` y ver el código
exacto. Si sale distinto, es una constante en un solo lugar
(`ONRAMPER_ASSET_CODES`).

**7. Degrada elegante si falta el env** — `OnramperNotConfiguredError`
tipado, `isOnramperConfigured()`, y la ruta del webhook responde `503`
limpio (no 500 crudo) si falta `ONRAMPER_WEBHOOK_SECRET`.

**8. Prueba del webhook, firma válida e inválida — AMBAS salidas** —
ejecuté `scripts/test-webhook-signature.mts` contra la función real de
`onramper.ts` (no una copia). Salida real de la corrida:

```
=== Caso 1: firma VÁLIDA ===
Signature enviada: ab796c3269a55783538990650ccf7a845477c486787a41d5ec48b5337e40e605
Resultado verifyOnramperWebhookSignature(): true
status mapeado -> completado
✅ ACEPTADA (correcto)

=== Caso 2: firma INVÁLIDA ===
Signature enviada (con secret equivocado): 382c09a71b13f5bd0a8f42cc7dddf5d5bdac9bf4bc1e502752eeb56a01fa6b83
Resultado verifyOnramperWebhookSignature(): false
✅ RECHAZADA (correcto)

=== Caso 3: sin header de firma ===
Resultado con header ausente: false
✅ RECHAZADA (correcto)

TODO OK — arnés confiable.
```

## Lo que quedó pendiente y por qué (causa raíz, no síntoma)

Esta sesión (Cowork/Chrome) no tiene el gateway MCP de Vulcano conectado
ni el secret de `/root/brain/exec`, así que no pude:
- Clonar `/root/codex-work/vanlink` para ver el schema real de Neon, el
  cliente de Turnkey, ni dónde vive tu pantalla de Actividad.
- Correr `npm run build` / `next lint` contra el repo real (sí corrí
  `tsc --noEmit` limpio contra Next 14 + React 18 instalados aquí, sobre
  todos los archivos .ts/.tsx entregados — 0 errores).
- Pegarle a la API real de Onramper (key es placeholder).

Todo lo demás — la lógica de firma, idempotencia, tipos, degradación —
es código real, tipado y ejecutado, no relleno.

## Siguiente paso más corto

1. Corre la migración SQL.
2. Pon las 4 env vars reales (con key/secret de verdad) en Vercel.
3. Conecta `getTurnkeyAddresses()` a tu lib de Turnkey.
4. Corre el curl de arriba para confirmar off-ramp y el código exacto de
   USDT en Base.
5. Copia el bloque de uso de `BuyWidget` + `SellGate` en tus pantallas.
