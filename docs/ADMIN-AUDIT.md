# Centro de mando: inventario y permisos

Fecha del inventario inicial: 9–10 de noviembre de 2026. Base de código: `27b2bcf` (PR #12). Esta auditoría distingue código, respuestas observadas de infraestructura y pruebas aisladas. Ninguna de ellas acredita la firma o recuperación de una persona real.

## Evidencia al arrancar

- `main` y el alias `vandefi.live` correspondían al commit `27b2bcf`. Vercel lo identificó como producción del proyecto institucional **vandefi**. `septvandefi` es una referencia histórica.
- La consulta agregada a Neon encontró cinco vínculos cuenta–wallet, cinco organizaciones, cinco direcciones EVM distintas, cuatro VanLinks, cero intentos en `wallet_operations` y cero actividades fiat. Son conteos del corte, no contabilidad on-chain ni total de usuarios Clerk.
- El esquema e índices de `wallet_operations` existen en producción. `USDT-TRACKING-MIGRATION.md` conserva una afirmación anterior a su aplicación; no usarla como estado de migraciones.
- Alchemy aparece entre los nombres de configuración de producción. La presencia de una variable no prueba sus permisos, validez, límites ni disponibilidad.
- `npm test` volvió a pasar con 131 pruebas y `npm run typecheck` pasó con Node 24 antes de esta implementación. Chromium revisó las rutas públicas de inicio, Cuenta, Actividad, Enviar y Recibir en escritorio, sin error de página ni desbordamiento.
- No hubo sesión autenticada de Luis en ese navegador, firma real, OTP, recuperación completa ni canario. Las dos wallets antiguas sin correo y la ausencia de política OTP constan en el QA previo; no se volvieron a verificar en Turnkey durante el inventario.
- La herramienta `read_thread` no estuvo disponible. El chat enlazado no se trató como evidencia ni se dedujo su contenido de su título.

## Matriz inicial

| Función | Fuente de datos | Backend | Pantalla | Permiso al arrancar | Prueba disponible | Estado al arrancar |
|---|---|---|---|---|---|---|
| Cuenta y wallet propia | Clerk, `user_wallets`, Turnkey | `/api/wallet/*` | Cuenta | Sesión y wallet propias | Onboarding, dispositivos y recuperación aislados | Existe, incompleto |
| USDT y POL | RPC Polygon, Alchemy o respaldo público | `/api/chain/polygon` | Inicio sencillo | Wallet propia | Cadena, contrato y enteros | Existe; sesión real sin comprobar |
| Intento Polygon | `wallet_operations` | Journal previo a broadcast | Monitor | Dueño | Falla DB impide broadcast; timeout conserva hash | Funciona en pruebas aisladas |
| Historial Polygon | Alchemy | `/api/chain/activity` | Actividad | Dueño | Validación parcial | Incompleto: 50 entradas y 50 salidas, sin páginas |
| Confirmación | Transacción, receipt y eventos | `/api/send/status` | Monitor | Dueño | Pruebas de receipt y eventos | Incompleto: una inclusión y sin corrección de reorg |
| Firma de diagnóstico | Llave del navegador, Turnkey, EIP-191 | Metadatos de dispositivo | Cuenta | Sólo inicio explícito del dueño | Criptografía y WebKit con Turnkey interceptado | Código comprobado; firma de Luis sin comprobar |
| Recuperación | Correo y OTP de Turnkey | `/api/wallet/recover/*` | Cuenta | Dueño | Dependencias aisladas | Incompleto; política y E2E pendientes |
| VanLinks | Neon e indexador | `/api/vanlink/*` | Mis VanLinks y enlace público | Privado para listar/crear; público para cobrar | Parcial | Legado; creación Polygon bloqueada |
| Actividad fiat | `fiat_activity` | `/api/onramp/activity` | Integración parcial | Consulta por wallet sin auth | Firma webhook aislada | Incompleto; exposición que cerrar |
| Mercado | Proxy de mercado | `/api/market*` | Mercado | Público | Sin sesión revisada | Existe; salud no comprobada |
| Administración y roles | Ausentes | Ausente | Ausente | Sin RBAC | Ninguna | Falta |
| Soporte y auditoría | Ausentes | Ausente | Ausente | Sin matriz | Ninguna | Falta |
| Salud, trabajos y activación | Presencia de configuración | Sin centro | Ausente | Sin autorización administrativa | Ninguna | Falta |
| Ingresos, comisiones, spread y referidos | Sin backend validado | Ausente | Sin módulo financiero real | No aplica | Ninguna | Planificación |

Los módulos posteriores al inventario se validan en [ADMIN-VALIDATION.md](ADMIN-VALIDATION.md); esta tabla no debe reescribirse para presentar el estado inicial como una capacidad ya entregada.

## Matriz de acceso del centro

Clerk autentica. Neon conserva concesiones explícitas por ID exacto y entorno. No hay administrador por correo, nombre, antigüedad, metadata editable o datos enviados por el navegador. Sin concesión activa, el usuario no accede al centro.

| Capacidad | Propietario/admin | Operaciones | Soporte | Auditor | Usuario normal |
|---|---|---|---|---|---|
| Panorama, cuentas, wallets y operaciones | Consulta | Consulta | Consulta | Consulta | Sólo sus flujos personales |
| Correo completo y verificación | Sí | Enmascarado | Sí | Enmascarado | Propio |
| Casos y notas privadas | Gestiona | Gestiona | Gestiona | Sólo metadatos, sin notas privadas | Sin acceso administrativo |
| Conciliación blockchain | Ejecuta | Ejecuta | Consulta evidencia | Consulta evidencia | Estado propio |
| Incidentes | Gestiona | Gestiona | Consulta | Consulta | Sin acceso |
| Auditoría | Completa | Operativa | Acciones propias | Completa con PII limitada | Sin acceso |
| Exportar | MFA y reverificación | No | No | No | Fuera del centro |
| Conceder/revocar roles ajenos | MFA y reverificación | No | No | No | No |
| Pausa/reanudación del entorno | MFA y reverificación | No | No | No | No |
| Firmar fondos, cambiar recuperación ajena o congelar fondos | No | No | No | No | Sólo flujos personales autorizados; no congelación |

El bootstrap se realiza fuera de la app y registra el actor externo, el entorno y el motivo. Luis eligió su cuenta VanDeFi como primer propietario; su ID exacto debe verificarse en sesión autorizada. No inferirlo de un listado. Prohibir cambio del rol propio y revocación del último propietario. Los privilegios se reevalúan en cada solicitud; la UI no es el control de acceso.

## Definiciones y límites

- **Cuenta:** identidad de Clerk; una fila de wallet no prueba que Clerk conserve esa identidad.
- **Wallet vinculada:** relación persistida en Neon. `user_wallets.created_at` es vinculación a la base, no registro en Clerk ni creación real en Turnkey.
- **Saldo observado:** lectura por red, contrato y activo, con bloque/fuente/fecha cuando existan. No equivale a tesorería ni ingresos de VanDeFi. Error de fuente significa desconocido o último dato fechado.
- **Volumen:** eventos únicos confirmados en el periodo y cobertura indicados. Una transferencia entre dos cuentas se cuenta una sola vez globalmente; puede aparecer en ambos expedientes.
- **Intento registrado:** metadatos del envío y hash persistidos; no demuestra que la red lo haya recibido.
- **Incluida:** receipt canónico observado, con profundidad. **Confirmada:** inclusión canónica alcanzada por `finalized`. Si el RPC no acredita finalidad, mantenerla desconocida.
- **Reemplazada:** otra transacción canónica del mismo remitente y nonce. Un nonce consumido sin esa evidencia exige investigación.
- **No localizada:** no se encontró el hash en la cobertura consultada; no afirma pérdida de dinero.
- **Firma comprobada:** requiere evidencia verificable contra la wallet concreta. Una declaración del dueño es reportada. Un administrador no conoce la llave privada de otro navegador ni su presencia actual.
- **Recuperación completa:** prueba autorizada de extremo a extremo de la wallet concreta. Correo presente, política configurada y recuperación probada son hechos independientes.
- **Acreditación en exchange:** desconocida, salvo integración verificable o reporte del usuario claramente rotulado. Confirmación Polygon no demuestra acreditación Binance.
- **Salud:** resultado de una comprobación inocua fechada, con alcance. Configuración presente no equivale a proveedor sano.

## Decisiones y pendientes

USDT de ADR-009 en Polygon PoS, cadena 137, seis decimales, y POL para gas son la referencia vigente. Base y Bitcoin son legado explícito. No añadir otra moneda ni cambiar el contrato por su símbolo on-chain.

Las decisiones rutinarias adoptadas son copia aislada de Neon, consulta a proveedores, permisos mínimos, trabajos acotados y pausa limitada al entorno. Permanecen decisiones para una futura puesta en producción: política de retención de PII, costos que excedan servicios existentes, financiación/comisiones y permisos adicionales. El estado real de firma, recuperación y canario necesita evidencia del dueño, no una decisión técnica.
