# Validación del centro de mando

Documento de evidencia. Los criterios pendientes no son resultados aprobados. No almacenar datos de clientes, credenciales o sesiones en este archivo ni en artefactos públicos.

## Evidencia anterior a la implementación

| Comprobación | Resultado | Alcance y límite |
|---|---|---|
| Referencia Git y producción | `27b2bcf`, PR #12; alias de proyecto Vercel `vandefi` | Metadatos de infraestructura del corte inicial |
| Conteos Neon | Cinco vínculos, cinco organizaciones y direcciones EVM, cuatro VanLinks, cero intentos/fiat | Consulta agregada; no historial on-chain ni total Clerk |
| Migración de intentos | Tabla e índices presentes | No demuestra futuras migraciones del centro |
| `npm test` | 131 aprobadas antes de los cambios del centro | Pruebas aisladas; no firma ni recuperación real |
| `npm run typecheck` | Aprobado antes de los cambios del centro | Comprobación estática |
| Chromium público | Inicio, Cuenta, Actividad, Enviar, Recibir; escritorio sin pageerror/desbordamiento | Sin sesión de Luis; no sustituye UI administrativa autenticada |
| Firma/OTP/canario reales | Sin comprobar | QA previo interceptó Turnkey; no hubo movimientos |
| Chat referenciado | No leído | Herramienta `read_thread` no disponible |

## Registro de esta implementación

### Resultados ejecutados el 10 de noviembre

- Preview institucional publicado en Vercel desde la rama `feat/vandefi-command-center-20261110`; PR #14 en draft. No merge ni promoción de aplicación a producción.
- Suite completa: **182 pruebas aprobadas**, incluida la regresión de parámetros SQL y MFA sin segundo factor. Typecheck y build Next.js aprobados. El build local usó la clave pública de Clerk visible en el HTML, sin credenciales de servidor.
- Migración `20261110_command_center.sql` aplicada dos veces en `br-crimson-wave-bcwz552e`. Conserva cinco vínculos originales; sin casos, trabajos, auditoría ni concesiones sintéticas persistidas. Se creó una credencial exclusiva con lectura de tablas heredadas, sin UPDATE/DELETE de auditoría ni escritura del marcador.
- **Siete comprobaciones reales en Neon**, dentro de subtransacción revertida: control de versión, auditoría inmutable, idempotencia, deduplicación de trabajo activo, precisión numérica, rol activo único y rollback completo. Script reproducible: `scripts/admin/isolated-integration.sql`.
- **Once módulos y 56 combinaciones de consultas** ejecutadas contra Neon real mediante transporte HTTP de validación, con la credencial limitada. Detectaron y corrigieron parámetros SQL sin tipo en auditoría/roles. El harness ejercitó las consultas; no sustituyó Clerk ni concedió acceso por HTTP al producto.
- **29 escenarios visuales** con el componente real y fuentes sintéticas locales: módulos, móvil/escritorio, teclado, formularios, filtros, decimales y cuentas sin wallet. Capturas marcadas como simulación, sin datos de clientes. No prueban autorización ni mutaciones reales.
- **Seis recorridos reales sin sesión** en el preview a 390/1440 px: redirecciones a Clerk conservan destino; sin errores JS ni desbordamiento. APIs administrativas rechazaron con 401; cinco rutas sensibles heredadas rechazaron POST con 403 `preview_mutation_blocked`.
- Sesión administrativa, MFA y consecuencias UI→API→Neon con el dueño: **pendientes** del ID exacto y bootstrap. Proveedores autenticados, firma y recuperación reales: **sin comprobar**.


La rama Neon `preview-command-center-20261110` (`br-crimson-wave-bcwz552e`) fue creada desde producción para el preview. La creación de rama no prueba por sí sola que el despliegue la utilice ni que una migración/restauración haya pasado.

Los resultados de código, migración, despliegue y navegador se añaden sólo tras ejecutar y contrastar las pruebas. No declarar aprobado un flujo por inspección visual o HTTP 200.

- `node --test tests/admin-bootstrap.test.mjs`: **siete pruebas aprobadas**. Cubren identidad exacta y reciente, rechazo de producción/host incorrecto, entrada privada sin symlinks, inicialización previa, rollback de auditoría, detección de diferencias de datos/esquema y rechazo de escaneos por encima del presupuesto. La transacción se probó con un cliente aislado; no demuestra por sí sola atomicidad contra Neon real.
- `node scripts/admin/bootstrap.mjs --help` y `node scripts/admin/verify-restoration.mjs --help`: comandos de ayuda comprobados.
- El bootstrap **no se ejecutó**: falta el ID exacto verificado y su atestación autorizada. No se asignó propietario por inferencia.
- El verificador de restauración está preparado. Su presencia y sus pruebas aisladas no acreditan una restauración real.
- **Restauración Neon con incidente:** una llamada de restauración omitió `finalize: false` y reasignó rama predeterminada y endpoint de producción entre **00:27:56 y 00:29:36 UTC**. Se restituyeron rama/nombre y endpoint originales. Los conteos y fingerprints agregados de cinco tablas coincidieron entre original y restaurada; la original conserva cero tablas `command_*`. `vandefi.live` respondió HTTP 200 con `27b2bcf` después de la corrección. No se puede acreditar éxito de todas las solicitudes durante la ventana. Véase [incidente y corrección](ADMIN-INCIDENT-RESTORE-20261110.md). **No considerar el ejercicio de restauración como plenamente aprobado ni afirmar que producción no cambió.**

| Área | Criterio de aceptación | Evidencia requerida |
|---|---|---|
| Autorización | Denegación predeterminada y matriz aplicada a páginas, APIs, búsquedas y exportaciones | Sesión anónima y cada rol; IDOR de cuenta/wallet/hash; revocación durante sesión |
| Privilegios | Sin autoelevación; último propietario protegido; MFA reciente para acciones sensibles | Casos negativos y auditoría de resultado |
| Aislamiento | Preview incapaz de escribir en producción/proveedores; datos de A desaparecen al cambiar a B | Guardas server-side, cambio de cuenta con respuesta demorada y verificación de destinos |
| Precisión | Un micro-USDT, seis decimales, enteros grandes, CSV exacto | Pruebas sin floats y cotejo fuente→API→pantalla |
| Indexación | Más de 50 movimientos/dirección, páginas repetidas/desordenadas, cursores y checkpoint | Pruebas de deduplicación y continuidad, cobertura visible |
| Conciliación | Red/contrato/remitente/destinatario/monto/evento exactos | Eventos correctos e incorrectos; fallo RPC preserva dato fechado |
| Finalidad/reorg | Inclusión distinta de confirmación; estados corregibles | RPC sin finalized, receipt desaparecido, bloque cambiado y corrección visible |
| Idempotencia | Un efecto por acción/reintento y recurso; auditoría atómica | Solicitudes concurrentes, lease perdido, fallo entre evento/checkpoint |
| Soporte | Caso/notas/responsable/estado con versión y permisos | Mutación real en preview y evento de auditoría enlazado |
| Salud | Comprobaciones inocuas fechadas; desconocido cuando no hay fuente | Proveedor caído/rate limit/config ausente y ausencia de secretos |
| Exportaciones | Sólo propietario reforzado; campos limitados y CSV seguro | Denegación por rol, fórmulas neutralizadas e importes intactos |
| Migración | Aditiva, repetible, sin alterar vínculos previos | Dos aplicaciones, esquema/constraints/conteos/checksums |
| Restauración | **Ejercicio con incidente; aceptación pendiente** | Comparación agregada coincidente tras restituir asignaciones. Falta ejercicio autorizado sin efectos productivos y validación completa de esquema/permisos; véase informe del incidente |
| Navegador | Interacción útil y accesible con sesión autorizada | 390/430/1440 px, teclado, zoom 200 %, carga/error/vacío/stale; capturas privadas redactadas |
| Consecuencia | Cada control tiene resultado en backend y auditoría | ID de acción/trabajo/registro y lectura posterior; sin reenvío financiero |

## Pendientes priorizados de activación

1. **Bloqueantes de acceso:** verificar ID exacto de Luis para bootstrap; comprobar sesión autorizada y MFA. No conceder acceso por coincidencia de nombre/correo.
2. **Bloqueantes de dinero:** firma desde navegador real, correo/política de recuperación de la wallet concreta, recuperación completa y canario aprobado. Mantener movimientos deshabilitados.
3. **Bloqueantes de puesta en producción:** validación de credenciales limitadas, cierre del incidente y un ensayo de restauración sin reasignaciones productivas con alcance completo, controles de despliegue y política aprobada de retención de PII.
4. **Operación continua:** programación de trabajos y alertas productivas con presupuesto y límites comprobados. En preview, ejecución explícita y última comprobación visible.
5. **Legado:** cobertura real de Base/Bitcoin, atomicidad/vinculación fiat y eliminación de cuenta recuperable. No usar los módulos pendientes como contabilidad completa.
6. **Futuro financiero:** comisiones, spread, referidos, gas patrocinado y wallets adicionales necesitan decisiones, backend y validación. No inventar tasas, ingresos o tesorería.

## Cierre de entrega

El informe final debe indicar URL y commit del preview, rama/base comprobadas, pruebas aprobadas con alcance, capturas revisadas, acciones contrastadas y partes que continúan sin verificar. Una interfaz renderizada o una suite aislada aprobada no permite decir «todo listo».
