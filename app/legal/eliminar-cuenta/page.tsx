import { DeleteAccount } from "@/components/legal/delete-account";

export const metadata = {
  title: "Eliminar cuenta · VanDeFi",
  description: "Cómo eliminar tu cuenta de VanDeFi y qué datos se borran.",
};

export default function EliminarCuentaPage() {
  return (
    <>
      <p className="eyebrow">ELIMINAR CUENTA</p>
      <h1>Cómo cerrar tu cuenta.</h1>
      <p className="legal-updated">Última actualización: 17 de septiembre de 2026</p>

      <p className="legal-callout">
        Antes de eliminar tu cuenta, <strong>retira todos tus fondos</strong>. Al borrar tu
        cuenta perdemos el vínculo con tu wallet y no podremos ayudarte a recuperarla. Los
        activos que queden en tus direcciones podrían volverse inaccesibles de forma
        permanente.
      </p>

      <h2>Qué se elimina</h2>
      <ul>
        <li>Tu cuenta de acceso y tu correo asociado.</li>
        <li>El vínculo entre tu cuenta y tus direcciones de wallet.</li>
        <li>Tu historial de actividad dentro de la aplicación.</li>
      </ul>

      <h2>Qué no se elimina</h2>
      <ul>
        <li>Las transacciones registradas en Base y Bitcoin: son públicas e inmutables, y no dependen de nosotros.</li>
        <li>Registros que debamos conservar por obligación legal o contable, por el plazo que marque la ley.</li>
        <li>Datos que hayan quedado en proveedores externos de compra o venta, sujetos a sus propias políticas.</li>
      </ul>

      <h2>Cuánto tarda</h2>
      <p>
        La eliminación se procesa de inmediato. Los respaldos técnicos pueden conservar
        copias hasta por 30 días antes de sobrescribirse.
      </p>

      <h2>Eliminar desde aquí</h2>
      <DeleteAccount />

      <h2>Eliminar por correo</h2>
      <p>
        Si prefieres solicitarlo por escrito, escribe desde el correo de tu cuenta a
        <a href="mailto:privacidad@vandefi.live"> privacidad@vandefi.live</a> con el asunto
        &quot;Eliminar cuenta&quot;. Respondemos en un plazo máximo de 30 días.
      </p>
    </>
  );
}
