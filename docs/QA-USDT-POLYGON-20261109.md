# QA — integración USDT Polygon (9 noviembre 2026)

Veredicto de revisión: APROBADO para integrar con Polygon deshabilitado. Canario pendiente.

## Resultado verificable

- Node 20.20.2: npm test, 82 pruebas aprobadas, 0 fallidas.
- npm run typecheck: aprobado. next build: aprobado.
- Ocho pruebas Polygon sustituyen la suite USDC. Cubren contrato Tether, seis decimales, destinatario, red 137, firma y logs auténticos.
- Handler broadcast probado con firma/hash reales y dependencias de red/DB aisladas: no transmite si falla persistencia; timeout y hash RPC discordante conservan el hash calculado sin afirmar éxito.
- Aislamiento por usuario verificado en historial, monitor y envío; respuestas tardías se descartan. Pendientes se consultan en lotes rotativos y conservan fecha del registro servidor.
- Escaneo de secretos y marcadores de conflicto: cero coincidencias. git diff --check aprobado.

## Integración

Se conserva Polygon de feat/vandefi-usdc-simple-alchemy-studio, se cambia a USDT según ADR-009 y se porta el seguimiento de fix/tx-tracking-receive-base-20261109. Base y Bitcoin conservan historial explícito en Experto. VanLink Polygon permanece bloqueado; un link USDC antiguo nunca genera una solicitud USDT.

El hash firmado se guarda antes de transmitir en navegador y servidor. Un recibo exitoso requiere evento USDT válido para confirmar. El estado Polygon no implica acreditación en Binance.

Se corrigieron imports y textos USDT pendientes, el topic ERC20 del seguimiento Base y una llave de cierre CSS ausente en el límite entre estilos Polygon y VANX.

## Base de datos

Migración 20261109_wallet_operations.sql validada dos veces en rama Neon QA br-calm-bird-bcd55a7v. Pasaron restricciones, idempotencia, FK, colisión de propietarios y filtros por usuario/wallet. Datos sintéticos revertidos. Backup producción previo verificado, permiso 0600.

Migración aplicada a producción con lock_timeout 3s. user_wallets=5 y vanlinks=4 antes/después; wallet_operations=0. No filas de prueba ni firmas/llaves almacenadas.

## Pendientes para habilitar dinero

- Alchemy privado Polygon Mainnet, lectura real de saldos/transferencias y variable de habilitación.
- Política OTP Turnkey: auditada ausente; dos wallets antiguas no tienen correo registrado. Probar recuperación de la wallet concreta en un navegador limpio antes de fondear.
- Despliegue explícito en proyecto institucional vandefi, equipo team_NoWzQnv9LwuPKxGKQxZZq0mJ; automatismo Git deshabilitado. Verificar commit servido en vandefi.live.
- QA con sesión y canario con fondos de Luis, según PLAN-PRUEBA-E2E-USDT.md; los recorridos sin sesión ya están comprobados abajo.

## Límites conocidos de esta beta

Confirmada significa inclusión observada desde un bloque. El tracker no reconcilia reorganizaciones de operaciones ya confirmadas; no equivale a finalidad ni acreditación del exchange. El historial del indexador consulta hasta 50 movimientos por dirección, sin paginación. Ninguno habilita automáticamente el canario.


## Navegador y preview verificados

Preview READY del código cd2830c: https://vandefi-hqtej9dd7-luisdelator-oss-projects.vercel.app . WebKit: 24 casos, rutas /, /send, /receive, /activity, /vanlink/create y /expert en 375/390/430/1440 px, sin sesión. Todos HTTP 200, desbordamiento máximo 0 px, pageerror 0. Captura de /send a390 px inspeccionada: USDT Polygon, acceso a cuenta y navegación legibles. Los flujos autenticados, firma con dispositivo real, OTP y canario siguen pendientes; estos resultados no los sustituyen.
