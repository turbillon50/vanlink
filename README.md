# VanDeFi / VanLink

Wallet no custodial y centro de consulta e investigación. El activo principal vigente es **USDT en Polygon PoS (chainId 137, seis decimales)**, con POL para gas, según [ADR-009](docs/ADR-009-usdt-polygon-unico.md). Base y Bitcoin se conservan como legado explícito. Los fondos de usuarios no son tesorería ni ingresos de VanDeFi.

## Estado y fuentes de verdad

- Repositorio oficial: https://github.com/turbillon50/vanlink
- Producción: https://vandefi.live; proyecto institucional Vercel **vandefi**. `septvandefi` pertenece al historial del proyecto.
- Next.js, TypeScript, Clerk, Turnkey, Neon Postgres y Vercel. Node 24 y npm con `package-lock.json`.
- La consulta de saldo, journal de intentos y seguimiento tienen backend. Las limitaciones y pruebas constan en [QA USDT Polygon](docs/QA-USDT-POLYGON-20261109.md).
- Los envíos Polygon permanecen pendientes de activación autorizada. Firma real, recuperación completa y canario no quedan acreditados por pruebas aisladas.
- Cuenta ofrece **Comprobar firma**, una prueba EIP-191 iniciada por el dueño sin transferencia. [QA de dispositivos](docs/QA-DEVICE-SIGNING-20261109.md) explica su alcance y limitaciones.

## Centro de mando

El alcance autorizado del centro es una rama aislada y preview, con copia Neon y acciones administrativas limitadas a ese entorno, sin merge, activación de dinero ni cambios de políticas productivas. Durante un ensayo de restauración se reasignó temporalmente infraestructura de producción y se restituyó; el [informe del incidente](docs/ADMIN-INCIDENT-RESTORE-20261110.md) detalla la ventana, corrección y límites de la evidencia.

- [Inventario inicial, métricas y matriz de permisos](docs/ADMIN-AUDIT.md)
- [Operación, incidentes, migraciones y rollback](docs/ADMIN-OPERATIONS.md)
- [Evidencia de validación y pendientes](docs/ADMIN-VALIDATION.md)

Clerk autentica; las concesiones administrativas son explícitas por ID y entorno, con acceso denegado por defecto. El administrador no firma fondos, no obtiene semillas/llaves, no modifica recuperación ajena y no puede prometer congelar fondos on-chain.

## Desarrollo

```sh
npm ci
npm test
npm run typecheck
npm run dev
npm run build
```

Mantener secretos en configuración privada, fuera de Git y logs. Usar servicios de desarrollo o preview aislados. `.env.example` documenta nombres, no valores. No ejecutar migraciones de prueba contra producción ni borrar IndexedDB para resolver problemas de firma.

La marca usa negro, verde/cian, Geist y superficies de cristal; [VANX tiene identidad separada](docs/vanx-brand-approved.md). La UI debe distinguir saldos reales, datos desconocidos, cobertura parcial, errores y funciones en planificación.
