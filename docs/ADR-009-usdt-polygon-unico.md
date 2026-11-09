# ADR-009 — VanDeFi: USDT en Polygon como única moneda
**Fecha:** 9 de noviembre de 2026
**Estado:** aprobado por Luis (9-nov-2026)
**Sustituye:** ADR-008 en la elección del activo (USDC → USDT). La red Polygon PoS y el resto de ADR-008 se mantienen.

## Decisión de Luis
- VanDeFi nació para remesas con rampas (on/off-ramp) y por eso cargaba Bitcoin, escáneres de BTC y LI.FI para bajar dinero en cada país. **Eso se acabó.**
- Una sola moneda: **USDT**, la más usada en Venezuela y Colombia.
- Una sola red: **Polygon PoS (chainId 137)**, misma dirección EVM de Turnkey que ya tienen los usuarios.
- Alcance de esta etapa: **solo transferir**. Sin préstamos, sin swaps, sin BTC, sin Base, sin otros tokens.

## Por qué Polygon y no TRON
- Las wallets de Turnkey ya son EVM; TRON obliga a otro formato de dirección y otra firma.
- Gas mínimo en POL; Bybit cobra 0.07 USDT por retirar en Polygon.
- TRON concentra el riesgo de congelamientos/monitoreo en flujos venezolanos.

## Contrato (verificado 9-nov-2026)
- USDT Polygon PoS: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`, **6 decimales**.
- Verificado on-chain (RPC chainId 137): `decimals()=6`. **Ojo:** `symbol()` hoy devuelve `USDT0` (migración de Tether al estándar USDT0 en el mismo contrato). En la interfaz se muestra **"USDT"**; no usar `symbol()` del contrato para la UI ni para validar.
- Bybit (API `/v5/asset/coin/query-info`, coin USDT, chain MATIC "Polygon PoS") usa exactamente este contrato; depósito y retiro habilitados, comisión de retiro 0.07, 60 confirmaciones.
- Binance: lista Polygon como red de USDT; **confirmar en la app de Binance de cada usuario de prueba** que la dirección de depósito USDT por red Polygon existe antes de mandar.
- Gas: **POL**. Sin POL el usuario no puede mover su USDT.

## Cambios que pide al código (rama de ADR-008)
1. Reemplazar el contrato USDC nativo por el contrato USDT de arriba en `lib/polygon/asset.ts` y todo lo que dependa de él (saldo, envío, VanLink EIP-681, recepción, tests).
2. Textos de UI: "USDT", nunca "USDC" ni "USDT0".
3. Mantener el corte de seguridad: `POLYGON_USDC_MAINNET_ENABLED` se renombra a `POLYGON_USDT_MAINNET_ENABLED` (o equivalente) + RPC privado (Alchemy) obligatorio.
4. Base/BTC quedan sólo como histórico en Experto (igual que ADR-008).

Ver `docs/PLAN-PRUEBA-E2E-USDT.md` para el plan de la prueba punta a punta.
