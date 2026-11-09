# Prueba beta: USDT en Polygon

Fecha: 9 de noviembre de 2026. Responsable: Luis. Integración y QA: Codex.

Objetivo: comprobar primero un envío con dinero de Luis. Después, y sólo si pasa, enviar 10 USDT a cada una de tres personas para que retiren a su propio Binance.

## Alcance de esta prueba

- USDT en Polygon PoS, chainId 137, contrato del ADR-009, seis decimales. Gas en POL.
- La wallet personal de Luis en VanDeFi fondea la prueba. No se crean wallets de tesorería, comisiones o gas.
- Sin comisión de VanDeFi, spread, referidos, tablero administrativo ni patrocinio automático de gas. Las comisiones reales de red y de los exchanges sí aplican.
- Base y Bitcoin conservan su historial explícito en modo Experto. No se convierten ni se reclasifican como Polygon.
- VanLinks de cobro Polygon quedan deshabilitados hasta su validación específica; no son necesarios para esta prueba de transferencias.

## Condiciones antes de fondear

1. Integración USDT + Polygon + seguimiento con pruebas, typecheck y build aprobados; verificar el commit que realmente sirve `vandefi.live`.
2. Aplicar y verificar `db/migrations/20261109_wallet_operations.sql` después de probarla y respaldar la base. Ver `USDT-TRACKING-MIGRATION.md`.
3. Configurar `ALCHEMY_API_KEY` en el servidor de Vercel, o un `POLYGON_RPC_URL` HTTPS compatible con Alchemy Transfers. Nunca usar una variable `NEXT_PUBLIC_*` para la llave. Verificar chainId 137, lectura de saldo e historial y límites del proveedor.
4. Crear y comprobar la política de recuperación por correo en la organización padre VanDeFi de Turnkey. Probar recuperación desde un segundo navegador limpio con una wallet de prueba vacía: mismo correo, misma organización y misma dirección; después comprobar que el nuevo dispositivo puede firmar. No basta con guardar la política.
5. Confirmar que el dueño de cada wallet tiene su correo correcto registrado en Turnkey. Las wallets antiguas sin correo requieren atención antes de recibir fondos.
6. Sólo después de estas comprobaciones, habilitar `POLYGON_USDT_MAINNET_ENABLED=true`. Mantenerla apagada mientras falten condiciones.
7. En Bybit y en cada Binance, comprobar que USDT usa Polygon PoS y el contrato del ADR-009. Revisar mínimos, comisiones y disponibilidad del retiro en el momento. No asumir importes históricos.

La llave Alchemy se introduce mediante un canal seguro vigente. No pegar llaves, códigos OTP ni frases de recuperación en el chat o el repo. El enlace de secretos de una sesión anterior puede haber caducado.

## Seguimiento verificable

El navegador calcula el hash de la transacción firmada antes de transmitir. El servidor valida firmante, red, contrato y transferencia; guarda hash y metadatos públicos asociados al usuario antes del broadcast. Nunca guarda la firma ni material de recuperación.

El historial minado se reconstruye desde Alchemy y los eventos USDT de la cadena. Los intentos guardados se recuperan desde la base al cambiar de dispositivo. El estado se contrasta con recibos y eventos on-chain; un error de consulta no implica fallo ni pérdida. Un timeout de broadcast conserva el hash y se muestra como envío por comprobar. No repetir la transferencia por ese error.

Confirmado en Polygon significa incluido correctamente en la cadena. La acreditación de Binance se comprueba por separado dentro de Binance.

## Canario con dinero de Luis

1. Comprar USDT cuando Luis esté listo; comprobar cualquier retención de retiros antes de prometer horario.
2. Copiar desde VanDeFi la dirección de Luis para Polygon y cotejarla completa. Desde Bybit retirar primero 2 USDT y POL suficiente según mínimos y cotización actual.
3. Registrar hash de retiro, dirección, monto y red. Esperar el saldo y el ingreso en VanDeFi; cotejar con Polygonscan.
4. En el Binance de Luis, abrir depósito USDT por Polygon y confirmar dirección, contrato y depósito mínimo actuales.
5. Desde VanDeFi enviar un monto que cumpla el mínimo de Binance, conservando POL para el gas. Guardar el hash antes de transmitir.
6. Comprobar estado, destinatario, contrato y monto exacto en VanDeFi y Polygonscan. Confirmar por separado que Binance acreditó el depósito.
7. Abrir VanDeFi en el segundo dispositivo recuperado: debe mostrar la misma wallet, historial y seguimiento.

PASA sólo si coinciden direcciones, contrato, red, montos y hashes entre app y explorador, el retiro se acredita en Binance y la recuperación fue probada. Si algo no coincide, detener nuevos envíos y reconciliar el hash existente.

## Tres personas, después del canario

1. Cada persona crea su cuenta con correo y tiene recuperación comprobada. Confirmar su depósito USDT Polygon en Binance antes de fondearla.
2. Luis envía POL desde Bybit directamente a cada dirección VanDeFi, según mínimos y comisión actuales; verificar recepción antes del USDT.
3. Luis envía 10 USDT desde su wallet personal a cada persona, una por una. Registrar y comprobar cada hash.
4. Cada persona comprueba saldo e historial y retira a su Binance respetando el depósito mínimo y dejando gas suficiente.
5. Cerrar con los seis movimientos USDT y los fondeos POL reconciliados. No publicar direcciones, correos u otros datos personales en el reporte público.

## Pendientes externos

- [LUIS] Crear app Alchemy con Polygon PoS Mainnet y cargar llave por canal seguro.
- [LUIS] Guardar política Turnkey y completar la prueba de recuperación con un navegador limpio.
- [LUIS] Comprar USDT/POL y revisar retiros cuando esté listo; no hay compromiso de hacerlo hoy.
- [OPERACIÓN] Validar migración y configuración, desplegar el commit verificado y comprobar dominio.
- [LUIS + QA] Ejecutar canario. Los tres envíos permanecen pendientes hasta que pase.
