# ADR-008 — VanDeFi: una sola red, USDC nativo en Polygon
**Fecha:** 9 de noviembre de 2026
**Estado:** aprobado como dirección de producto; nuevas operaciones mainnet sujetas a homologación
**Sustituye:** ADR-007 en todo lo relativo a Solana/TRON como redes candidatas.

## Decisión de producto de Luis
1. **Simple:** USDC nativo en **Polygon PoS (chainId 137)**. Una moneda, una red, cuatro acciones: Comprar, Enviar, Retirar y VanLink.
2. **Experto:** playground modular donde cada persona pueda añadir tokens ERC-20 de Polygon por su dirección de contrato y consultar su saldo con Alchemy/RPC. El seguimiento de un token NO lo habilita automáticamente para transferirlo.
3. **Base y Bitcoin:** quedan como compatibilidad histórica de cuentas y fondos existentes, con acceso desde Experto. No se borran wallets, llaves, direcciones ni saldos.
4. **Sin Solana y sin TRON:** no se crean cuentas ni conectores por defecto para esos ecosistemas.
5. **Bybit / Onramper / Bitcoin:** pueden participar como proveedores internos de entrada/salida si su ruta llega a USDC Polygon con cotización real y autorización. **No son el activo público del producto.**

## Contrato, cadena y firma
- USDC Circle nativo Polygon PoS: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`, 6 decimales.
- No confundir con USDC.e puenteado: `0x2791bca1f2de4661ed88a30c99a7a9449aa84174`.
- ChainId: **137**. Gas en **POL**, no BTC, SOL, TRX o MATIC antiguo.
- Turnkey: se reutiliza la **misma dirección EVM** ya provisionada. Polygon y Base comparten formato de dirección, pero **no saldo ni contratos ni gas**.
- Turnkey firma una transacción EVM con `chainId=137`; el backend verifica remitente, contrato USDC, selector `transfer`, firma y destino antes de retransmitir.
- La transferencia precisa POL para gas hasta que exista patrocinio seguro verificado.

## Alcance implantado en la rama de integración
- Lector de saldo USDC Polygon autenticado mediante RPC con verificación `eth_chainId=0x89`.
- Inicio Simple con USDC real de Polygon, sin sumar BTC u otros tokens como USDC poseído.
- Cuatro acciones y modo Experto separado con watchlist ERC-20 de solo lectura por contrato.
- Cotización/simulación EIP-1559 USDC Polygon, verificación de firma, broadcast restringido y lectura de recibo.
- QR de recepción Polygon con advertencia de red; acceso histórico Base/BTC sólo en Experto.
- VanLink USDC Polygon: EIP-681 nativo, monto exacto en enteros, recepción directa y comprobación mediante hash del evento Transfer; doble asignación del mismo hash bloqueada.
- Visual craft Obsidian y accesibilidad de PWA.

## Corte obligatorio de seguridad
`POLYGON_USDC_MAINNET_ENABLED=true` **Y** un RPC privado (variable `POLYGON_RPC_URL` HTTPS o `ALCHEMY_API_KEY`) son requisitos para activar envíos, depósitos y cobros Polygon. Sin ambos, el sistema es **lectura/preparación**, no permite mover fondos a una red sin salida probada.

No afirmar que Comprar/Retirar funcionan hasta conseguir un proveedor fiat autorizado con una ruta USDC Polygon exacta y sus comisiones reales.

## Plan mínimo de homologación
1. Configurar RPC dedicado Alchemy para Polygon y verificar `eth_chainId`.
2. Revisar restricciones de Turnkey de la cuenta real para firmas chainId 137.
3. Cuenta de prueba propia: leer, recibir pequeño depósito USDC Polygon, fondear POL, simular, firmar, enviar, seguir receipt.
4. VanLink: comprobar pago único con TXID real y bloqueo de duplicados; contratar indexador Alchemy para comprobación automática.
5. Confirmar que las plataformas de retiro y P2P de destinatarios acepten **USDC por Polygon**, no sólo USDT/TRON o BTC.
6. Verificar compra/venta fiat autorizada y cotizar costo end-to-end, impuestos, KYC y cumplimiento.
7. Activar flag, monitorizar, luego publicar a usuarios de producción.

## Documentación de referencia
- Circle USDC nativo y contrato: https://www.circle.com/multi-chain-usdc/polygon
- Circle USD Coin soportado: https://help.circle.com/support/en/usdc-supported-blockchains-minting-redemption-faqs?id=kb_article_view&sysparm_article=KB0010590
- Alchemy Polygon chainId 137/POL: https://www.alchemy.com/docs/choosing-a-web3-network
- Polygon POL para gas: https://polygon.technology/blog/matic-to-pol-migration-is-99-complete-everything-you-need-to-know
- Alchemy Portfolio API: https://www.alchemy.com/docs/how-to-get-crosschain-token-balances
