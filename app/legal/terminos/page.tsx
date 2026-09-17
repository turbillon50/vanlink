export const metadata = {
  title: "Términos de uso · VanDeFi",
  description: "Condiciones para usar VanDeFi.",
};

export default function TerminosPage() {
  return (
    <>
      <p className="eyebrow">TÉRMINOS DE USO</p>
      <h1>Las reglas del juego.</h1>
      <p className="legal-updated">Última actualización: 17 de septiembre de 2026</p>

      <h2>1. Qué es VanDeFi</h2>
      <p>
        VanDeFi es una aplicación que te permite crear y usar una wallet de activos
        digitales, consultar información de mercado y acceder a proveedores externos
        para comprar o vender con dinero fiat. El servicio lo presta All Global Holding
        LLC a través de su marca V·Momentum.
      </p>

      <h2>2. Qué NO es VanDeFi</h2>
      <ul>
        <li>No somos un banco ni una institución de tecnología financiera.</li>
        <li>No damos asesoría financiera, fiscal ni de inversión.</li>
        <li>No custodiamos ni administramos tu dinero: tus activos viven en la blockchain, bajo llaves que controlas tú.</li>
        <li>No garantizamos rendimientos de ningún tipo.</li>
      </ul>

      <h2>3. Tu cuenta y tu dispositivo</h2>
      <p>
        Para operar necesitas una cuenta y un dispositivo autorizado. La llave de firma se
        genera en tu navegador y no sale de él. <strong>Si pierdes el acceso a tus
        dispositivos autorizados, puedes perder el acceso a tus fondos de forma
        irreversible.</strong> No podemos recuperarlos por ti.
      </p>

      <h2>4. Operaciones en blockchain</h2>
      <p>
        Las transacciones en Base y Bitcoin son públicas, definitivas e irreversibles. Una
        vez confirmadas no pueden cancelarse ni revertirse, ni por ti ni por nosotros.
        Verifica siempre la dirección de destino y la red antes de enviar: enviar a una
        dirección equivocada o por la red equivocada normalmente implica pérdida total.
      </p>

      <h2>5. Proveedores externos</h2>
      <p>
        Las compras y ventas con dinero fiat las procesan terceros con sus propias
        condiciones, comisiones, límites y requisitos de verificación de identidad. No
        controlamos sus decisiones ni respondemos por ellas.
      </p>

      <h2>6. Uso permitido</h2>
      <p>
        Te comprometes a usar VanDeFi conforme a la ley, a no emplearlo para actividades
        ilícitas, lavado de dinero o financiamiento al terrorismo, y a no intentar
        vulnerar la seguridad del servicio o el acceso a cuentas ajenas.
      </p>

      <h2>7. Disponibilidad</h2>
      <p>
        El servicio se ofrece &quot;tal cual&quot;. Podemos interrumpirlo por mantenimiento,
        fallas de proveedores o causas ajenas a nosotros. Algunas funciones pueden estar
        limitadas o no disponibles según tu país.
      </p>

      <h2>8. Límite de responsabilidad</h2>
      <p>
        En la medida que la ley lo permita, no respondemos por pérdidas derivadas de
        variaciones en el precio de los activos, errores al capturar direcciones, pérdida
        de tus dispositivos o llaves, fallas de terceros, ni de las redes blockchain.
      </p>

      <h2>9. Terminación</h2>
      <p>
        Puedes dejar de usar VanDeFi y eliminar tu cuenta cuando quieras. Podemos
        suspender cuentas que incumplan estos términos o la ley aplicable.
      </p>

      <h2>10. Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para
        cualquier controversia, las partes se someten a los tribunales competentes de la
        Ciudad de México.
      </p>

      <h2>11. Contacto</h2>
      <p><a href="mailto:soporte@vandefi.live">soporte@vandefi.live</a></p>
    </>
  );
}
