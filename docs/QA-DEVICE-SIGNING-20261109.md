# Acceso de firma: verificación de dispositivo y conservación de llaves

Veredicto: APROBADO en revisión de código. La firma de la cuenta del usuario requiere la comprobación en su navegador original.

## Problema y corrección

Una wallet anterior al marcador local podía conservar su llave P256 en IndexedDB y aun así aparecer como dispositivo no autorizado. La verificación devolvía falso antes de consultar Turnkey cuando faltaba el marcador. Preparación y recuperación podían reemplazar llaves existentes.

La identidad exacta de organización y dueño en Turnkey ahora determina el acceso. Una comprobación válida repara el marcador sin cambiar la llave; el marcador es auxiliar y su fallo de escritura no invalida la identidad. Las lecturas y todos los firmantes cargan exclusivamente llaves existentes. La recuperación bloquea llaves desconocidas o de otra cuenta, revalida dentro del bloqueo global y conserva la misma llave al reintentar un registro fallido.

Cuenta ofrece Comprobar firma: mensaje diagnóstico EIP-191 fijo con nonce aleatorio y fecha, verificación local contra la dirección esperada, sin transacción ni broadcast. Sólo el usuario puede iniciarlo. No se guarda ni muestra la firma. Copiar diagnóstico incluye estado, huella pública y últimos seis caracteres de la dirección.

El endpoint de metadatos requiere sesión y toma organización/dueño de la wallet de esa cuenta. Devuelve sólo huellas y presencia de correo; nunca claves o credenciales. Perfil y estado se desmontan al cambiar usuario. Cuenta muestra USDT Polygon como red principal y legado en Experto.

## Evidencia

- Node 20: 131 pruebas aprobadas, cero fallidas. Incluyen 18 de dispositivo, 14 de recuperación, 11 de diagnóstico/firmantes y 6 del endpoint privado, además de las 82 previas.
- Typecheck y build de producción Next.js (webpack): aprobados. El build local usa webpack por dependencias enlazadas entre worktrees; Vercel valida el build estándar desde Git.
- WebKit: 8 casos con SDK real, IndexedDB real y llaves P256 generadas exclusivamente en un contexto de prueba aislado. La consulta a Turnkey se interceptó: cero llamadas reales al proveedor. Comprobados marcador ausente/obsoleto, identidad ajena, fallo de red, preparación legacy y error de almacenamiento del marcador; siempre se conserva la llave.
- UI: SSR y seis escenarios simulados contra el componente real; ausencia de llave, huella diferente e identidad incorrecta nunca solicitan firma. Sólo una firma recuperada correctamente aparece comprobada.
- Diff y escaneo de secretos/marcadores: aprobados.

## Límites y verificación pendiente

No se ejecutaron firmas de wallets reales, OTP, correos ni transferencias. No se cambiaron direcciones, dueños ni llaves de usuarios. La firma real se comprueba en Cuenta mediante el botón explícito. Si el navegador perdió la llave original, esta corrección no la recrea; usar el navegador original y revisar recuperación con su dueño. La política OTP y el registro de correo de wallets antiguas siguen pendientes. Polygon permanece deshabilitado para movimientos hasta resolverlos y pasar el canario.
