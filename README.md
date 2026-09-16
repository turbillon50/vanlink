# VanDeFi / VanLink — Craft

Revisión del proyecto existente `septvandefi`, recuperado del deployment Vercel
`dpl_9PzaxmNQ7qzmBwkpS7jfWw7uUtjH` el 16 de septiembre de 2026.

## Estado real

Esta entrega reconstruye la interfaz y corrige flujos engañosos. No es todavía
una wallet operativa: el acceso ahora se integra con Clerk, pero faltan la
activación de wallets y las APIs financieras. Postgres y el puente Clerk–Turnkey
están preparados, con activación deshabilitada. No se han enviado fondos.

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

Clerk tiene DNS/HTTPS activos. Falta autorizar la credencial limitada de Turnkey
y probar la activación real; conectar las claves de Alchemy, LI.FI y Onramper.
Mantener Base/USDC como eje, con USDT por red y Bitcoin nativo para rutas que lo
justifiquen. Consulta [el estado y los controles de activación](docs/wallet-integrations.md).

Los VanLinks publicados necesitan identificadores de servidor, control del
propietario, expiración, estado persistente y confirmación real en cadena.
Un borrador local no es un link público, no recibe dinero ni se sincroniza.

## Desarrollo

```sh
npm ci
npm run dev
npm run build
node --test tests/*.test.mjs
```

Las pruebas de borradores usan Node 24. La comprobación de TypeScript está
habilitada durante la compilación.

## Alcance

Sin dLocal, MercadoPago, Rapyd, Cryptomus, Reloadly, Airtable ni auth/ramp/swap
adicionales. Clerk es el único sistema de autenticación. No se ejecutaron
operaciones financieras.

## Código y publicación

- Repositorio exclusivo: https://github.com/turbillon50/vanlink
- Proyecto Vercel: septvandefi
- Producción: https://vandefi.live (DNS y HTTPS activos)
- URL alternativa: https://septvandefi.vercel.app
- Node 24; npm y package-lock.json para instalaciones reproducibles.
- Entrada de marca de 4.4 s, omitible con Entrar. Trazo de luz, corrientes orbitales, halo y revelado suave. No espera a las APIs; CSS la cierra incluso sin hidratación; no se repite en navegación interna.
- Movimiento reducido omite la entrada y detiene las animaciones.
- Campos, filtros, botones, dock y superficies comparten bordes ópticos, estados de foco y microinteracciones.
- Los cinco CNAME de Clerk están publicados en Name.com con TTL 300; HTTPS y el formulario de acceso funcionan. La activación de una wallet requiere una prueba con un usuario real.
- Cristal y gráficos vectoriales locales; no hay vídeos pesados ni peticiones de imágenes externas.

Este repositorio contiene exclusivamente el reinicio de septiembre de 2026.
Los repositorios antiguos de VanDeFi se conservan por separado.

## Acceso con Clerk

- `@clerk/nextjs` 7, `proxy.ts` para Next 16, interfaz en español de México.
- Registro `/sign-up`, acceso `/login`, y `/profile` protegido en el servidor.
- Datos y seguridad de la cuenta se administran con la interfaz oficial de Clerk.
- Variables: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY`.
  La secreta solo existe como variable sensible de producción en Vercel.
- Para desarrollar usa claves de una instancia de desarrollo en `.env.local`;
  `.env.example` documenta sus nombres. Sin configuración se mantiene la vista
  pública; `/profile` redirige al acceso.
- La interfaz maneja carga lenta/fallida de Clerk con reintento y salida a inicio.
- Los borradores siguen siendo locales al navegador, no datos asociados a una
  identidad ni enlaces cobrables.
