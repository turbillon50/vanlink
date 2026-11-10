# Operación del centro de mando

El centro permite consultar, investigar y gestionar soporte. No firma transferencias de usuarios, no conoce semillas o llaves privadas, no reemplaza llaves IndexedDB, no cambia dispositivos o correos de recuperación ajenos y no congela fondos on-chain.

## Entornos y activación

La preparación usa la rama Git `feat/vandefi-command-center-20261110` y la rama Neon **preview-command-center-20261110**, ID `br-crimson-wave-bcwz552e`, creada desde producción. Sus escrituras son independientes. Validar identidad de rama y marcador de entorno antes de migrar o arrancar; no basta con que la variable se llame `DATABASE_URL`.

Producción continúa en `vandefi.live`, proyecto institucional Vercel **vandefi**. No hacer merge, promover despliegues, apuntar dominios de producción al preview ni cambiar políticas de producción como parte de esta preparación.

Durante el ejercicio de restauración del 10 de noviembre hubo una reasignación productiva no prevista durante unos 100 segundos, posteriormente corregida. Leer [el incidente y sus límites de verificación](ADMIN-INCIDENT-RESTORE-20261110.md). No repetir restauraciones en vivo en esta sesión ni presentar producción como intacta.

Antes de considerar Polygon habilitable, exigir evidencias independientes de:

1. Cadena 137, contrato ADR-009 y seis decimales validados, RPC privado y configuración necesaria válidos.
2. Migraciones aplicadas y comprobadas en la base correcta.
3. Firma real desde el navegador autorizado y recuperación completa de la wallet concreta.
4. Canario autorizado y aprobado, incluyendo destino/red correctos y resultado observado.
5. Acceso administrativo y auditoría comprobados en sesión real.

Un indicador verde de configuración no sustituye los demás requisitos. El preview no habilita movimientos. La pausa del centro sólo detiene nuevas emisiones desde la app en su entorno; no cancela transacciones transmitidas, no bloquea otras apps y no congela fondos.

## Bootstrap externo del primer propietario

Usar `scripts/admin/bootstrap.mjs` únicamente después de que Luis haya confirmado su identidad en una sesión Clerk autorizada. El script **no autentica al operador ni demuestra por sí solo la identidad**: valida una atestación privada del procedimiento ya realizado. No obtener el ID buscando un nombre/correo ni usar una fila de wallet como sustituto de la sesión.

El operador debe disponer de archivos privados regulares, de su propiedad y con permisos `0600`: uno con la conexión directa de la rama aislada y otro con la atestación mínima. No usar enlaces simbólicos. La atestación tiene exactamente estos campos:

```json
{
  "schemaVersion": 1,
  "method": "authenticated-clerk-session",
  "clerkUserId": "<ID exacto comprobado en sesión>",
  "authorizedBy": "Luis",
  "environment": "preview",
  "authorizationReference": "<referencia privada sin tokens ni PII>",
  "verifiedAt": "<fecha ISO de la comprobación, últimas 24 horas>",
  "issuer": "<issuer Clerk autorizado>"
}
```

No incluir tokens, cookies, OTP, correos ni capturas de sesión. El hash de la atestación y su fecha se guardan en auditoría; no se almacena el documento completo.

Después de configurar `ADMIN_NEON_BRANCH_ID`, `ADMIN_DATABASE_HOST` (host directo, sin pooler) y `CLERK_OIDC_ISSUER`, ejecutar con valores ya verificados:

```sh
node scripts/admin/bootstrap.mjs \
  --user-id '<ID exacto verificado>' \
  --environment preview \
  --operator-id '<identificador del operador externo>' \
  --reason '<motivo y autorización comprobada>' \
  --clerk-verified-evidence /ruta/privada/atestacion.json \
  --database-url-file /ruta/privada/conexion
```

El comando rechaza producción, destino/marker discrepantes, identidad inconsistente, evidencia vencida y cualquier concesión previa en el entorno. Usa bloqueo transaccional y escribe propietario y auditoría juntos. El operador debe ser externo al ID destino. No existe endpoint de bootstrap en la app y no hay variable permanente que convierta una identidad en administradora. Los cambios posteriores se realizan por un propietario sobre otra identidad, con autorización reforzada.

## Procedimiento habitual

- Leer fuente, entorno, fecha y cobertura antes de interpretar un contador o saldo.
- Abrir un caso para una discrepancia, vincular cuenta/operación y asignar responsable y prioridad. Las notas son privadas y deben contener sólo evidencia necesaria.
- Actualizar fuentes o conciliar desde acciones autorizadas, con motivo. Consultar el ID del trabajo y su resultado; pulsar de nuevo no debe duplicar el trabajo o el efecto.
- Investigar un hash con red, contrato, remitente, destinatario, unidades mínimas, bloque y evento. Nunca usar conciliación para reenviar.
- Si la fuente falla, preservar evidencia anterior con su fecha. Reintentos agotados o lease vencido necesitan investigación; no transformar la falla en éxito o cero.
- El preview usa procesamiento explícito. La ausencia de programación continua debe verse como tal. No dejar un navegador haciendo polling para simular supervisión de producción.
- Registrar el cierre del caso con evidencia y consecuencia comprobada. Un clic aceptado o HTTP 200 no prueba por sí solo que el problema se resolvió.

## Diagnóstico mínimo y privacidad

Recoger estado, huella pública, versión, navegador y fecha sólo cuando sean relevantes. No solicitar, pegar, capturar ni registrar semillas, llaves privadas, OTP, credenciales temporales, cookies o sesiones. La prueba de firma del dueño se inicia explícitamente en su navegador; soporte no toma control de su llave.

Las exportaciones requieren propietario, MFA, reverificación y auditoría. Mantener datos personales fuera de GitHub, logs, capturas públicas, informes compartidos o memorias de agentes. Redactar PII antes de adjuntar evidencia. No tratar un archivo CSV como un log público; impedir fórmulas al abrirlo y conservar importes exactos.

## Procedimientos de incidentes

Cada fila define la evidencia mínima, impacto y responsable. La respuesta autorizada conserva fondos y relaciones; toda modificación administrativa exige motivo y auditoría.

| Incidente | Evidencia e impacto | Responsable | Acción permitida y escalamiento | Recuperación comprobable |
|---|---|---|---|---|
| Llave perdida | Estado local observado por el dueño, huella registrada, cuenta y fecha. Firma indisponible; saldo puede existir. | Soporte; dueño para probar | Orientar al navegador original. Escalar a seguridad si no existe recuperación probada. No crear/reemplazar llave ni recrear wallet. | Dueño firma diagnóstico o completa recuperación autorizada de esa wallet; registrar evidencia y fecha. |
| Navegador equivocado | Huella/identidad local distinta o sin llave; no asumir pérdida definitiva. | Soporte | Abrir caso, verificar cuenta elegida y navegador original. No borrar IndexedDB. | Identidad y firma comprobadas por el dueño en el navegador correcto. |
| Cambio de sesión o datos residuales | ID de solicitud, versión, secuencia A→B y respuesta demorada, sin tokens. Riesgo de exposición o acción cruzada. | Seguridad/ingeniería | Detener acción pendiente, cerrar vista privada, reproducir con cuentas de prueba y aislar regresión. Escalar si hubo exposición real. | Solicitudes viejas abortadas/descartadas, autorización vigente en servidor, prueba A→B y B→A aprobada. |
| Recuperación incompleta | Etapa, correo presente/verificado, política observada y error seguro; jamás OTP. | Soporte y seguridad | Diferenciar correo ausente, inconsistente, política ausente y proveedor caído. Dueño sigue el flujo autorizado; sin cambios administrativos de recuperación. | Prueba completa en entorno/navegador aislado con autorización del dueño; identidad y firma finales coinciden. |
| Correo inconsistente | Resultado de comparación permitida entre Clerk verificado y dueño Turnkey. Riesgo de recuperar a identidad incorrecta. | Seguridad | Bloquear recuperación ambigua, conservar vínculos, escalar al dueño y procedimiento autorizado. No inferir equivalencia por texto parecido. | Correo y dueño acreditados por flujo autorizado; nueva prueba de recuperación. |
| POL insuficiente | Saldo POL fechado y estimación real de gas con fuente. Envío no ejecutable. | Operaciones y dueño | Explicar importe requerido según cotización, vigencia y red. El dueño fondea mediante flujo autorizado. No enviar gas desde tesorería inexistente. | Nueva lectura y simulación válidas; cualquier transferencia posterior necesita confirmación del dueño. |
| Red, activo o contrato incorrectos | chainId, contrato, decimales, hash y eventos. Puede ser activo no reconocido o transferencia en otra red. | Operaciones; seguridad si configuración | Bloquear afirmaciones de pago y nuevas emisiones por la app si corresponde. Consultar la red concreta sin cambiar el registro original; escalar al proveedor/dueño. | Evidencia de la red/activo real y clasificación corregida; no prometer reversión on-chain. |
| Destinatario incorrecto | Dirección exacta revisada por el dueño y evento real; evitar copiar PII innecesaria. Puede haber envío irreversible. | Operaciones y dueño | Detener cualquier nuevo intento, abrir incidente y consultar cadena. Escalar a receptor/exchange por canales autorizados por el dueño. | Estado y destino documentados; devolución sólo si existe nueva operación real del receptor. No marcar recuperado por promesa. |
| RPC caído | Código seguro, latencia, fecha de última lectura y alcance. Datos desconocidos o atrasados. | Operaciones/infraestructura | Reintento acotado, conservar último dato, comprobar fuente secundaria permitida. Escalar al proveedor si persiste. | Lecturas válidas de cadena/contrato y conciliación de la ventana afectada; retirar alerta con evidencia. |
| Límite Alchemy | 429/código, `Retry-After`, número de intentos y checkpoint sin URL secreta. Indexación detenida. | Operaciones | Respetar espera, limitar concurrencia/páginas y revisar consumo disponible. No contratar plan ni lanzar escaneo ilimitado. | Trabajo reanudado desde checkpoint, cobertura completa del rango y deduplicación comprobada. |
| Datos atrasados o trabajo detenido | Edad de observación, checkpoint, intentos, lease y última actividad. Métricas incompletas. | Operaciones | Investigar lease y errores, reanudar trabajo idempotente autorizado y acotado. Escalar a ingeniería si se repite. | Checkpoint avanza atómicamente y fechas/cobertura vuelven a ser válidas; nunca rellenar faltantes con ceros. |
| Broadcast incierto | Hash calculado antes del envío, intento persistido, timeout y consulta posterior. No se sabe si llegó a la red. | Operaciones | Consultar/reconciliar el mismo hash y nonce. No retransmitir automáticamente ni sugerir otro pago como recuperación. | Receipt/evento exacto o clasificación no localizada con cobertura; incertidumbre explícita si continúa. |
| Nonce reemplazado | Mismo remitente/nonce y otra transacción canónica. Nonce consumido solo no basta. | Operaciones | Vincular hashes como evidencia, conciliar ambas operaciones. Escalar si destino/importe no corresponden. | Transacción canónica identificada y estado corregido; nunca afirmar reemplazo sin la otra transacción. |
| Reorganización | Cambio de hash de bloque, receipt ausente o log removido. Estados previamente mostrados pueden cambiar. | Operaciones/ingeniería | Invalidar observaciones derivadas, retroceder checkpoint al ancestro válido y reconsultar rango. Conservar historial de corrección. | Bloques/eventos canónicos verificados, estados corregidos en centro e historial del usuario y auditoría enlazada. |
| Depósito confirmado sin acreditación | Hash confirmado y evidencia del dueño sobre exchange/red/cuenta, sin credenciales. Saldo interno del exchange desconocido. | Soporte y dueño | Mostrar confirmación Polygon y acreditación desconocida/reportada como hechos distintos. Preparar evidencia para soporte del exchange; no reenviar. | Acreditación verificada por integración o confirmada por dueño con evidencia; mantener origen del reporte. |
| Acceso indebido | Denegaciones, permiso/recurso, correlación y fechas, sin sesiones. Posible exposición. | Seguridad/propietario | Revocar concesión ajena por flujo autorizado, preservar auditoría y contener el entorno. Escalar si hubo lectura/exportación indebida. | Pruebas negativas, revocación efectiva en siguiente solicitud y revisión de recursos afectados. |
| Credencial expuesta | Nombre de credencial/proveedor, alcance y ventana; no copiar valor al caso. | Propietario y seguridad | Contener el componente y solicitar rotación por operador autorizado. No incorporar credenciales root ni ocultar evidencia. Producción requiere autorización específica. | Credencial antigua invalidada, nueva limitada validada, revisión de uso y despliegue correcto. |
| Migración fallida | ID/checksum, base/entorno, error seguro, locks y conteos previos. Puede impedir lectura o escritura. | Ingeniería/infraestructura | Detener migrador y trabajos, preservar esquema/datos, comprobar transacción. Corregir en rama aislada; no probar sobre producción. | Migración repetible, checks de integridad y restauración aislada aprobados. |
| Despliegue defectuoso | Commit y deployment ID, errores seguros y última versión válida. Operación degradada. | Ingeniería/propietario | Cerrar nuevas acciones del preview, detener trabajador y volver al preview previo. No promover ni cambiar alias de producción. | Rutas, autorización, fuentes y auditoría comprobadas en la versión restaurada. |
| Restauración | Backup, hash, origen, destino aislado y fecha. Riesgo de pérdida o mezcla de entornos. | Infraestructura y seguridad | Restaurar únicamente sobre una base/rama aislada; validar marcador antes de conectar la app. No sobrescribir ni resetear producción. | Conteos/checksums de datos previos, constraints, permisos, auditoría y consultas de consistencia coinciden. |

## Migraciones, backup y restauración

1. Identificar proyecto, rama, base y entorno mediante metadatos y marcador. No imprimir cadenas de conexión.
2. Respaldar la rama de prueba con conexión directa, archivo privado y checksum; guardar credenciales fuera del repositorio.
3. Aplicar SQL versionado con límites de espera y transacción cuando proceda. Registrar versión/checksum. No ejecutar migraciones al renderizar páginas.
4. Repetir aplicación para comprobar idempotencia; contrastar conteos y hashes de filas existentes, claves, índices y aislamiento.
5. En un ejercicio futuro autorizado, restaurar el respaldo en un destino aislado diferente. Con snapshot Neon, especificar `finalize: false` y no enviar `target_branch_id`; comprobar antes y después rama predeterminada, nombre y endpoint productivos y límites de compute. No continuar si se modifican. Ejecutar las mismas consultas de consistencia. No repetir restauraciones en vivo durante esta preparación.
6. Registrar fecha, comando sin secretos, resultado y limitaciones en validación. La existencia de un archivo backup no prueba restauración.

La auditoría nueva debe sobrevivir a desvinculaciones. No usar `ON DELETE CASCADE` desde identidades o wallets para sus hechos. Los flujos antiguos de eliminación requieren evaluación propia antes de uso productivo; el preview bloquea eliminación de cuentas contra proveedores reales.

### Verificación reproducible de una restauración aislada

`scripts/admin/verify-restoration.mjs` no restaura ni migra; sólo compara datos y esquema. Con `ADMIN_NEON_BRANCH_ID` y `ADMIN_DATABASE_HOST` del destino aislado comprobados, capturar una referencia privada antes del ejercicio:

```sh
node scripts/admin/verify-restoration.mjs \
  --database-url-file /ruta/privada/conexion-origen-aislado \
  --baseline-file /ruta/privada/referencia.json \
  --capture
```

Después de restaurar en otra rama y ajustar **su marcador explícitamente mediante el procedimiento autorizado**, configurar las variables del destino y comparar:

```sh
node scripts/admin/verify-restoration.mjs \
  --database-url-file /ruta/privada/conexion-restaurada \
  --baseline-file /ruta/privada/referencia.json
```

El verificador rechaza tablas con más de 100.000 filas antes de calcular fingerprints y aplica un timeout de consulta de diez segundos. Se contrastan conteos, fingerprints de filas, índices y constraints de `user_wallets`, `vanlinks` y `wallet_operations`, sin emitir filas de clientes. La referencia no se sobrescribe y exige `0600`. Un resultado coincidente acredita ese alcance; no comprueba políticas externas, llaves, roles de PostgreSQL, objetos excluidos ni recuperación Turnkey. Añadir las consultas específicas del nuevo esquema al ejercicio completo. No confundir esta comparación aislada con una restauración aprobada de producción.

## Rollback del preview

- Deshabilitar acceso y procesamiento en ese entorno, conservar evidencia de trabajos/acciones y seleccionar el último despliegue preview validado.
- Mantener tablas aditivas y auditoría. El rollback de código no borra datos ni requiere revertir el esquema.
- Si los datos de prueba están dañados, restaurar en otra rama aislada y validar antes de cambiar la conexión del preview.
- Nunca promover el preview, hacer merge a `main`, resetear producción o reemplazar políticas de Turnkey como parte del rollback.
- Documentar resultado y riesgo residual. Una recuperación de página sin validar backend y permisos no cierra el incidente.

## Credencial del preview

La aplicación usa `command_preview_app`, un rol dedicado sin `neon_superuser`. Crear como `read_write` restringido a la base aislada y aplicar `scripts/admin/preview-role-permissions.sql`: las tablas heredadas y el marcador quedan de consulta, y auditoría sólo admite INSERT/SELECT. Mantener las conexiones de migración/bootstrap fuera de Vercel. Verificar `has_table_privilege` antes de desplegar. Cada ejecución de trabajos registra como actor al operador que la inicia; el trabajo conserva quién lo encoló.
