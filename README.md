# VanDeFi / VanLink — Craft

Revisión del proyecto existente `septvandefi`, recuperado del deployment Vercel
`dpl_9PzaxmNQ7qzmBwkpS7jfWw7uUtjH` el 16 de septiembre de 2026.

## Estado real

Esta entrega reconstruye la interfaz y corrige flujos engañosos. No es todavía
una wallet operativa: el proyecto original no tiene autenticación, API, base de
datos ni variables de entorno configuradas. No se han enviado fondos.

### Implementado

- Negro absoluto, iluminación localizada y componentes de cristal.
- Dock móvil de tres destinos, menú hamburguesa y áreas seguras.
- Composición amplia en escritorio, sin dock móvil.
- Bienvenida, pantalla de carga ligada a navegación real y errores recuperables.
- Borradores de VanLink: validación, persistencia local, listado, detalle y copia
  explícitamente marcada como borrador. No se crean enlaces de pago.
- Envío: validación de formato y revisión de datos sin firma ni transferencia.
- Intercambio y compra/venta: controles coherentes, cotizaciones pendientes.
- Perfil con opciones desplegables informativas; sin botones con destino #.
- Eliminación de saldos, movimientos, sesiones y direcciones de cobro inventadas.
- Iconos de instalación, zoom accesible y soporte para reducir movimiento.

### Pendiente para operar

Conectar Clerk como único acceso; Turnkey con propiedad/firma del usuario
verificadas; Alchemy; LI.FI; Onramper; Postgres. Mantener Base/USDC como eje.

Los VanLinks publicados necesitan identificadores de servidor, control del
propietario, expiración, estado persistente y confirmación real en cadena.
Un borrador local no es un link público, no recibe dinero ni se sincroniza.

## Desarrollo

```sh
npm ci
npm run dev
npm run build
node --test tests/drafts.test.mjs
```

Las pruebas de borradores usan Node 24. La comprobación de TypeScript está
habilitada durante la compilación.

## Alcance

Sin dLocal, MercadoPago, Rapyd, Cryptomus, Reloadly, Airtable ni auth/ramp/swap
adicionales. No se cambiaron accesos ni se ejecutaron operaciones financieras.

## Código y publicación

- Repositorio exclusivo: https://github.com/turbillon50/vanlink
- Proyecto Vercel: septvandefi
- Producción: https://septvandefi.vercel.app
- Dominio asociado: vandefi.live (requiere DNS en Name.com)
- Node 24; npm y package-lock.json para instalaciones reproducibles.
- Splash decorativo de 1.48 s al abrir, sin retrasar peticiones ni capturar clics; navegación normal sin repetirlo.
- Movimiento reducido omite la entrada y detiene las animaciones.
- Cristal y gráficos vectoriales locales; no hay vídeos pesados ni peticiones de imágenes externas.

Este repositorio contiene exclusivamente el reinicio de septiembre de 2026.
Los repositorios antiguos de VanDeFi se conservan por separado.
