# Incidente de restauración Neon — 10 de noviembre de 2026

Durante la preparación del preview, una restauración de snapshot reasignó temporalmente el compute y la rama predeterminada de producción. La intención era crear un destino aislado; la llamada omitió `finalize: false` y el comportamiento predeterminado finalizó el reemplazo. Esto afectó infraestructura de producción y excedió el aislamiento autorizado. No debe describirse esta sesión como «producción intacta» o «sin cambios en producción».

## Secuencia y corrección

| Hora UTC | Hecho comprobado por el operador |
|---|---|
| 00:27:56 | La restauración dejó `br-noisy-shadow-bcitrs7y` como rama predeterminada y le asignó el endpoint de producción. La rama original `br-small-feather-bc9qqmom` conservó sus datos. |
| 00:29:36 | Se restituyeron la rama original como predeterminada y su nombre `production`. El endpoint `ep-divine-voice-bcb21h1w` volvió a `br-small-feather-bc9qqmom`, con sus límites de 1 CU sin cambios. |
| Tras la corrección | La rama restaurada quedó sin ser predeterminada y sin endpoint de producción. El compute temporal `ep-tiny` se trasladó a la rama de aparcamiento `br-twilight-hat-bch48edz`, limitado a 0,25 CU y suspensión tras 300 segundos. |

La ventana de asignación incorrecta fue aproximadamente **100 segundos**, de 00:27:56 a 00:29:36 UTC. No se cambió el despliegue de la aplicación para corregirla.

Neon había rechazado crear el snapshot desde una rama que no era raíz; se usó un snapshot de la rama raíz. La omisión de `finalize: false` en la restauración posterior provocó el cambio de asignaciones. El snapshot de raíz tiene expiración el **17 de noviembre de 2026**; no tratarlo como respaldo permanente.

## Evidencia posterior

El operador contrastó conteos y fingerprints agregados de filas entre la rama original y la restaurada, sin emitir datos de clientes:

| Tabla | Filas | Comparación agregada |
|---|---:|---|
| `user_wallets` | 5 | Coincidente |
| `vanlinks` | 4 | Coincidente |
| `wallet_operations` | 0 | Coincidente |
| `fiat_activity` | 0 | Coincidente |
| `wallet_oauth_flows` | 0 | Coincidente |

La rama original de producción tenía **cero tablas `command_*`**. `vandefi.live` respondió HTTP 200 y mantuvo el commit `27b2bcf` después de la corrección.

Estas comprobaciones no encontraron filas divergentes en las tablas comparadas. **No demuestran que todas las solicitudes durante la ventana hayan tenido éxito**, ni cubren toda posible actividad externa, todos los objetos de la base o la recuperación de Turnkey. No afirmar ausencia total de impacto ni un ensayo de restauración plenamente aprobado.

## Contención y prevención

- No ejecutar más restauraciones en vivo durante esta preparación.
- En un ejercicio futuro autorizado, indicar explícitamente **`finalize: false`**, omitir `target_branch_id` y comprobar que el resultado crea un destino independiente antes de conectar cualquier aplicación.
- No confiar en que omitir el destino significa restauración aislada. Revisar los valores predeterminados de la herramienta y sus efectos sobre nombres, compute y rama predeterminada.
- Capturar y contrastar antes/después: rama predeterminada, nombre de producción, rama del endpoint productivo y límites de compute. Ante cualquier cambio inesperado, detener el ejercicio y restituir las asignaciones originales.
- Separar verificación de datos, esquema, permisos y recuperación de servicio. Una comparación coincidente de tablas y HTTP 200 son evidencias acotadas, no una garantía de servicio continuo.

Este documento recoge la evidencia de corrección comunicada por el operador de infraestructura. Su redacción no ejecutó consultas ni operaciones adicionales contra servicios vivos.
