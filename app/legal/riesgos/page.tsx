export const metadata = {
  title: "Advertencia de riesgos · VanDeFi",
  description: "Riesgos de usar activos digitales.",
};

export default function RiesgosPage() {
  return (
    <>
      <p className="eyebrow">ADVERTENCIA DE RIESGOS</p>
      <h1>Léelo antes de mover un peso.</h1>
      <p className="legal-updated">Última actualización: 17 de septiembre de 2026</p>

      <p className="legal-callout">
        Los activos digitales no están respaldados por ningún gobierno ni cubiertos por
        seguros de depósito. Puedes perder la totalidad de lo que inviertas.
      </p>

      <h2>Volatilidad</h2>
      <p>
        El precio de Bitcoin y de otros activos digitales puede cambiar de forma abrupta
        en minutos. Rendimientos pasados no anticipan resultados futuros.
      </p>

      <h2>Irreversibilidad</h2>
      <p>
        Una transacción confirmada en blockchain no se puede cancelar. No existe contracargo
        ni aclaración: si te equivocas de dirección o de red, el dinero normalmente se pierde.
      </p>

      <h2>Custodia de llaves</h2>
      <p>
        Tu wallet se controla con llaves que viven en tus dispositivos. Perderlos todos
        equivale a perder los fondos. Registra más de un dispositivo cuando la función esté
        disponible.
      </p>

      <h2>Stablecoins</h2>
      <p>
        USDC y USDT buscan mantener paridad con el dólar, pero esa paridad no está
        garantizada y depende de la solvencia y las reservas de cada emisor.
      </p>

      <h2>Riesgo regulatorio</h2>
      <p>
        Las reglas sobre activos digitales cambian por país y pueden afectar la
        disponibilidad del servicio, de ciertos activos o de las rampas de compra y venta.
      </p>

      <h2>Riesgo tecnológico</h2>
      <p>
        Fallas de red, congestión, errores en contratos inteligentes o interrupciones de
        proveedores pueden retrasar o impedir operaciones.
      </p>

      <h2>Nada de esto es asesoría</h2>
      <p>
        La información de mercado que muestra VanDeFi es solo informativa. No constituye
        asesoría financiera, fiscal ni recomendación de compra o venta. Consulta a un
        profesional antes de tomar decisiones.
      </p>
    </>
  );
}
