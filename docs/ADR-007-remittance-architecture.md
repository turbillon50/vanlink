# ADR-007 · VanDeFi como wallet de remesas (v2)
**Estado:** decisión arquitectónica; implementación de nuevas redes pendiente de pruebas end-to-end
**Proyecto:** `turbillon50/vanlink` · `vandefi.live` · 2026-11-09

## Decisión de producto
VanDeFi NO debe presentarse como una wallet "USDC en Base" ni como una wallet "Bitcoin primero".
Debe ser una **wallet multired orientada a transferir stablecoins**, con Bitcoin como activo opcional,
la red oculta al usuario simple cuando sea seguro y revelada siempre al confirmar.

La unidad del saldo principal puede ser una equivalencia en USDC, pero eso **no convierte**
BTC, USDT o tokens de otras redes a USDC real. No confundir valor estimado, token y blockchain.

## El error original, constatado en código
- Turnkey `createSubOrganization` crea actualmente `DEFAULT_ETHEREUM_ACCOUNTS` y
  `DEFAULT_BITCOIN_MAINNET_P2WPKH_ACCOUNTS`.
- La cuenta Ethereum/EVM está siendo usada para Base; el módulo de envíos codifica `chainId:8453`.
- `user_wallets` almacena EVM y Bitcoin; no guarda direcciones Solana ni TRON.
- `/api/chain/balance` lee Base y BTC nativo solamente.
- `/receive` y `/send` solo muestran Base/Bitcoin.
- `lib/providers/lifi.ts` actualmente consulta catálogo de tokens: **no ejecuta swaps**.
- No hay actualmente transferencias SPL Solana, TRC20 TRON ni una rampa hacia bolívares lista.
- Ningún endpoint actual debe prometer que se depositó o transfirió por Solana/TRON.

## Redes y prioridades comerciales
| Red | Token prioritario | Rol | Estado de producto hoy |
|---|---|---|---|
| Solana | USDC nativo, USDT si compatible con destino | Primera candidata a pagos de bajo costo | NO recibir/enviar todavía |
| TRON | USDT TRC20 | Candidata a conexión con P2P/exchanges venezolanos | NO recibir/enviar todavía |
| Ethereum / EVM | USDC/USDT | Infraestructura avanzada y rutas de liquidez | EVM creada; Ethereum mainnet NO habilitado |
| Base | USDC, USDT, cbBTC | Compatibilidad heredada con fondos existentes | Soportada |
| Bitcoin | BTC nativo | Fondeo, reserva, intercambio opcional | Soportada |

**Advertencia:** USDC en TRON no es un activo de Circle con soporte vigente.
Evitar ofrecerlo como USDC nativo. En TRON se prioriza investigar USDT TRC20.

## Cómo elegir ruta de remesa
1. Confirmar país, destinatario y dónde quiere recibir (wallet, exchange, P2P o banco).
2. Obtener la lista de activos/redes aceptadas **por ese destino**, no por preferencias internas.
3. Solicitar cotizaciones reales y vigentes para el importe concreto.
4. Incluir comisión de red, energía/TRX o SOL, bridge, spread, límites, valor final y tiempo.
5. Descartar operaciones no aprobadas, incompatibles, expiradas o no ejecutables.
6. Elegir el mejor valor neto al destinatario y pedir confirmación.
7. Firmar desde el dispositivo autorizado; verificar hash, finalización y comprobante.
8. Si el P2P ocurre fuera de VanDeFi, **no afirmar cuánto recibió en VES** sin su evidencia.
9. No presentar la vía bancaria si aún no hay socio autorizado con pagos comprobados.

`lib/remittance/rail-policy.ts` implementa el registro y un filtro/ordenador puro de
cotizaciones **cuando existan**. No hace solicitudes a LI.FI, no crea wallets ni envía fondos.

## Requisitos para habilitar nuevas redes
### Fase A. Cuenta segura
- Añadir `DEFAULT_SOLANA_ACCOUNTS` y `DEFAULT_TRON_ACCOUNTS` a la configuración
  de Turnkey con derivación y asignación controlada **sin sobrescribir las existentes**.
- Para usuarios antiguos, derivar cuentas adicionales con autorización y reconciliación,
  no crear otra organización ni modificar fondos históricos.
- Guardar direcciones con `chain`, `addressFormat`, `derivationPath`, `assetId`
  (mint/contrato exacto, no ticker) y `turnkeyWalletId`. Migraciones reversibles.
- Confirmar recuperación por correo y firma desde segundo dispositivo.
- No exponer direcciones para depósito hasta que el flujo de salida esté probado.

### Fase B. Infraestructura de dinero real
- Solana: consultar SPL token accounts y ATA, saldo, SOL/rent/fee, construir, simular,
  firmar con Turnkey, enviar y seguir transacción; patrocinio si el modelo lo permite.
- TRON: monitorizar TRC20 USDT, estimar Energy/Bandwidth/TRX, simular, firmar y transmitir,
  monitorear confirmaciones. Estudiar staking/delegación de energía para microremesas.
- Ethereum: mantener separación red EVM vs chainId; nunca usar contrato Base en mainnet.
- Bitcoin/Base: seguir leyendo y permitiendo retiros de los fondos ya existentes.
- Probar con **cuentas de prueba sin saldo comercial** antes de habilitar botones.

### Fase C. LI.FI / liquidez / remesas
- Confirmar soporte actual de la combinación origen/destino/activo y quote real LI.FI,
  incluyendo TRON o Solana cuando sean alcanzables y elegibles.
- Ajustar la presentación de costos y custodios; no inventar equivalencias 1:1.
- Bybit se mantiene como **proveedor optativo**, no como requisito de identidad, wallet o liquidez.
- Separar el concepto `wallet` (Turnkey), `network` (Solana/TRON/EVM/BTC),
  `asset` (USDT/USDC/BTC) y `provider` (LI.FI/Bybit/rampa).
- P2P: las operaciones externas no forman parte de la liquidación garantizada de VanDeFi.

## Criterio de liberación
Sin acreditación hasta probar: registro → dirección real → depósito de importe mínimo →
saldo consultado → envío firmado → destino correcto → comprobante → recuperación →
coste real documentado. No activar redes o tarjetas solo porque el SDK puede derivar una dirección.

## Fuentes oficiales verificadas (noviembre 2026)
- Turnkey multichain: https://www.turnkey.com/blog/developer-tooling-crypto-wallets-key-management
- Turnkey helper accounts: https://www.turnkey.com/blog/create-sub-orgs-resources-policies
- Turnkey API de crear cuentas adicionales: https://docs.turnkey.com/api-reference/activities/create-wallet-accounts
- LI.FI TRON: https://li.fi/knowledge-hub/li-fi-update-march-and-april-2026
- LI.FI Intents Solana: https://li.fi/knowledge-hub/li.fi-intents-is-now-live-on-solana
- USDC soportado por Circle: https://developers.circle.com/circle-mint/supported-chains-and-currencies
- Costos y recursos TRON: https://developers.tron.network/docs/bandwidth-and-energy
- Reglas de costo USDT TRC20: https://developers.tron.network/docs/smart-contract-errors
