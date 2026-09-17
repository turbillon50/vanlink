export const metadata = {
  title: "Aviso de privacidad · VanDeFi",
  description: "Cómo VanDeFi trata tus datos personales.",
};

export default function PrivacidadPage() {
  return (
    <>
      <p className="eyebrow">AVISO DE PRIVACIDAD</p>
      <h1>Tus datos, explicados sin rodeos.</h1>
      <p className="legal-updated">Última actualización: 17 de septiembre de 2026</p>

      <h2>Quién es responsable</h2>
      <p>
        All Global Holding LLC, a través de su marca V·Momentum, es responsable del
        tratamiento de tus datos personales en VanDeFi (vandefi.live). Para cualquier
        asunto de privacidad puedes escribir a <a href="mailto:privacidad@vandefi.live">privacidad@vandefi.live</a>.
      </p>

      <h2>Qué datos recabamos</h2>
      <ul>
        <li><strong>Identidad y acceso:</strong> correo electrónico y datos de sesión, gestionados por nuestro proveedor de autenticación.</li>
        <li><strong>Datos de wallet:</strong> tus direcciones públicas de Base y Bitcoin, y los identificadores de tu wallet con nuestro proveedor de custodia.</li>
        <li><strong>Actividad:</strong> registros de operaciones de compra o venta que realices mediante proveedores externos.</li>
        <li><strong>Datos técnicos:</strong> registros de servidor necesarios para operar y proteger el servicio.</li>
      </ul>

      <h2>Qué NO guardamos</h2>
      <p>
        No almacenamos tus llaves privadas. La llave de tu dispositivo se genera en tu
        navegador, permanece no extraíble y nunca viaja a nuestros servidores. Tampoco
        guardamos datos de tarjetas: los pagos con dinero fiat ocurren dentro del
        proveedor correspondiente.
      </p>

      <h2>Para qué los usamos</h2>
      <p>
        Para darte acceso a tu cuenta, mostrarte tus saldos y movimientos, cumplir
        obligaciones legales, prevenir fraude y mejorar el servicio. No vendemos tus
        datos personales ni los usamos para publicidad de terceros.
      </p>

      <h2>Con quién los compartimos</h2>
      <p>
        Únicamente con proveedores necesarios para operar: autenticación, custodia de
        llaves, base de datos, alojamiento, lectura de blockchain y rampas de compra o
        venta de dinero fiat. Cada uno trata los datos bajo sus propias políticas y solo
        para prestarnos el servicio.
      </p>

      <h2>Qué es público por naturaleza</h2>
      <p>
        Las transacciones en Base y Bitcoin se registran en cadenas públicas. Cualquier
        persona puede consultar los movimientos asociados a una dirección. Eso no depende
        de nosotros y no puede revertirse.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos
        (derechos ARCO), así como revocar tu consentimiento, escribiendo a
        <a href="mailto:privacidad@vandefi.live"> privacidad@vandefi.live</a>. También
        puedes eliminar tu cuenta tú mismo desde <a href="/legal/eliminar-cuenta">esta página</a>.
      </p>

      <h2>Conservación</h2>
      <p>
        Conservamos tus datos mientras tengas cuenta activa y, después, únicamente el
        tiempo que exijan las obligaciones legales aplicables.
      </p>

      <h2>Menores de edad</h2>
      <p>VanDeFi no está dirigido a personas menores de 18 años.</p>

      <h2>Cambios</h2>
      <p>
        Si modificamos este aviso, publicaremos la nueva versión en esta página con su
        fecha de actualización.
      </p>
    </>
  );
}
