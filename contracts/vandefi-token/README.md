# VanDeFi Token (VANX) · contrato ERC-20

**Estado: código creado y probado localmente; NO desplegado en Polygon ni en Amoy.**

Propuesta de símbolo **VANX** (no aprobado definitivamente). Nombre **VanDeFi**. Red objetivo: **Polygon PoS** (chainId 137), con **Amoy** (80002) para ensayos.

Este proyecto está intencionalmente aislado de las API de remesas en `vandefi.live`. **USDC sigue siendo el único activo del modo Simple**. VANX sería opcional y sólo aparecería tras diseñar sus casos de uso, en recompensas o en el Playground Experto.

## Contrato y garantías del código

- ERC-20 estándar implementado con OpenZeppelin Contracts 5.4.0.
- 18 decimales; emisión inicial **variable por parámetro del despliegue**, sin valor predefinido.
- El 100% de la emisión se entrega a una **tesorería indicada en el constructor**, que debería ser una multisig.
- Emisión **fija**: no existe función pública `mint`, ni admin, impuestos, blacklist, pausa, upgrade o rescate arbitrario.
- `transfer` y `approve` funcionan como ERC-20 estándar. Nadie puede gastar saldos ajenos sin la aprobación correspondiente.
- NO es USDC, NO está anclado a USD, no es un depósito, y no representa capital social ni derecho a rendimientos.

## Pruebas reproducibles

Desde `contracts/vandefi-token/`:

```bash
npm install
npm test
npm run compile
```

Las pruebas usan `ganache` en memoria, sin fondos ni claves reales. El compilador produce `artifacts/VanDeFiToken.json`, que no se publica automáticamente.

## Preparar un despliegue sin enviar fondos

Se debe elegir la tesorería y la emisión exacta. **No hay defaults deliberadamente**.

```bash
VANX_TREASURY=0xDIRECCION_MULTISIG_REAL \
VANX_INITIAL_SUPPLY_WHOLE=CANTIDAD_APROBADA \
npm run plan:deployment -- amoy
```

Genera `artifacts/deployment-review-amoy.json`, con ABI/bytecode y los parámetros de construcción, pero **NO firma ni despliega**.

Para mainnet se podrá revisar `npm run plan:deployment -- polygon`. No ejecutar sin aprobación explícita de: símbolo, cantidad, tesorería, distribución y finalidad.

**Nunca poner claves privadas, mnemonics, frases de recuperación ni API secrets en GitHub, logs o comandos de despliegue.** Para publicar en Amoy/mainnet usar la wallet Turnkey o una multisig con revisión de la transacción en el dispositivo.

## Antes de emitir en blockchain

1. Definir uso concreto (p. ej., recompensas de actividad) sin mezclarlo con los USDC que recibe un usuario.
2. Confirmar símbolo y emisión total, presupuesto de tesorería, reglas de distribución y tratamiento de tokens no reclamados.
3. Definir si habrá liquidez o cotización pública. **Emitir ERC-20 no crea mercado ni valor automáticamente.**
4. Validar aspectos legales, fiscales y de protección al consumidor según países; no publicitar rendimientos.
5. Pasar una auditoría de smart contract proporcional al manejo de fondos antes de integrar tokens en pagos o tesorería.
6. Ensayar en Polygon Amoy, obtener dirección real y verificar fuente en explorer, sin tocar la wallet USDC del producto principal.
7. Revisar la firma del despliegue y ejecutar mainnet sólo tras autorización.

## Referencias

- OpenZeppelin ERC-20: https://docs.openzeppelin.com/contracts/5.x/erc20
- Polygon Amoy: https://support.polygon.technology/support/solutions/articles/82000907114-how-to-add-amoy-network-in-your-wallet-
- Polygon mainnet (chainId 137): https://docs.polygon.technology/pos/reference/rpc-endpoints/
