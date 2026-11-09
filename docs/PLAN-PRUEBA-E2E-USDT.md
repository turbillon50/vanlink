# Plan — prueba punta a punta USDT Polygon (beta)
**Fecha:** 9 de noviembre de 2026 · **Dueño:** Luis · **Constructor:** ChatGPT/Codex · **Auditor/QA:** Claude (Vulcano)

Objetivo: que Luis mande $10 USDT a 3 personas (2 Venezuela, 1 Colombia), que les llegue, lo vean bien en su app, y lo puedan mandar a su Binance — y que TODO quede reflejado fielmente en tablero, historial y blockchain.

## 1. Wallets de la casa
- **Madre (tesorería):** fondea usuarios de prueba; única que recibe de Bybit.
- **Comisiones:** sólo recibe. Aquí se ve lo que gana VanDeFi.
- **Gas:** guarda POL para dar gas a los usuarios.
Cada una con su política en Turnkey; ninguna llave en el chat ni en el repo.

## 2. Cómo gana VanDeFi (PENDIENTE de Luis)
- Propuesta: comisión fija por retiro a wallet externa (ej. Binance); envíos entre usuarios VanDeFi gratis.
- La comisión viaja como transferencia propia a la wallet de Comisiones, con su hash.

## 3. Gas (PENDIENTE de Luis)
- Propuesta beta: la wallet Gas regala una pizca de POL al activar cada wallet de prueba.
- Alternativa posterior: patrocinio de gas por transacción.

## 4. Estados de una operación
creada → firmada → TXID guardado (antes del broadcast) → transmitida → confirmada → acreditada | fallida (con motivo).
Registro en Neon; un reconciliador compara contra la blockchain y marca lo que no cuadre.

## 5. Historial
Por usuario, enviados y recibidos. Depósitos externos detectados vía Alchemy (transferencias del contrato USDT hacia la dirección).

## 6. Escáneres
QR para recibir (EIP-681 con contrato USDT y chainId 137) y cámara para enviar. Si la red/dirección no es Polygon o el token no es USDT: bloquear.

## 7. Tablero (cero placeholders)
- Saldos de Madre, Comisiones y Gas leídos en vivo de la blockchain.
- Operaciones con estado y hash.
- Regla: cada número debe poder rastrearse a su fuente. Auditoría de código buscando mocks/valores fijos; comparación del tablero contra Polygonscan.

## 8. Guion de la prueba
1. Fondear Madre desde Bybit: USDT por red "Polygon PoS" (contrato del ADR-009). Cargar POL en Gas.
2. Madre → 3 usuarios de prueba: $10 USDT cada uno.
3. Cada usuario ve saldo e historial correctos.
4. Cada usuario retira parte a SU Binance (red Polygon, confirmada antes en su app).
5. La comisión llega a Comisiones.
6. **PASA sólo si** tablero, historial de cada usuario y Polygonscan coinciden al centavo.

## Fuera de alcance
Préstamos, swaps, LI.FI, BTC, Base, rampas, P2P, otros tokens.

## Decisiones abiertas de Luis
1. Monto de la comisión por retiro externo.
2. Esquema de gas para la beta.
