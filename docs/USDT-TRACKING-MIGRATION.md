# Seguimiento Polygon en otro dispositivo

La migración aditiva `db/migrations/20261109_wallet_operations.sql` crea el registro de intentos de envío. Debe aplicarse antes de habilitar los envíos Polygon. No se ha aplicado a producción como parte de este cambio.

1. Respaldar la base de producción con `pg_dump` siguiendo la operación existente, sin copiar credenciales a consola o commits.
2. Revisar y aplicar el SQL de la migración con la conexión administrativa de la misma base que usa VanDeFi.
3. Verificar columnas, clave primaria e índice de `wallet_operations` y que una sesión solo consulta sus filas.
4. Ejecutar el canario después de configurar Alchemy y recuperación Turnkey. Comprobar el mismo hash desde otro dispositivo y contrastar contrato, destinatario, cantidad y confirmaciones con Polygonscan.

El servidor guarda el hash calculado de la transacción firmada, la wallet, el destinatario y el monto entero antes de transmitir. Nunca guarda firma, frase de recuperación, clave privada ni OTP. Si la escritura falla, no transmite la transacción. No hay una escritura posterior a la emisión que pueda convertir un envío real en un error de persistencia.

Una fila registra un intento, no demuestra un envío exitoso. Un timeout devuelve el mismo hash con estado por comprobar para que se consulte en cadena sin repetir el pago. Una confirmación requiere receipt exitoso y evento USDT del contrato Polygon aprobado. El historial de movimientos minados también se reconstruye desde Alchemy; la caché local es solo apoyo.
