import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";

export const metadata = {
  title: "VANX · Token de VanDeFi",
  description: "Identidad aprobada del token VANX de VanDeFi. Contrato y lanzamiento aún en preparación.",
};

export default function VanxPage() {
  return (
    <AppShell wide>
      <TopBar title="VANX" backHref="/operate" />
      <div className="vanx-brand-page">
        <header className="vanx-brand-intro">
          <p className="vanx-eyebrow">VANDEFI · TOKEN · POLYGON</p>
          <h1>VAN<span>X</span></h1>
          <p>La identidad elegida para el token de VanDeFi.</p>
        </header>
        <div className="vanx-medallion" aria-label="Arte aprobado de VANX">
          <Image
            src="/brand/vanx/vanx-approved-mark.webp"
            width={128}
            height={128}
            alt="Emblema VANX aprobado: moneda de titanio oscuro, V metálica, detalles dorados."
            priority
            unoptimized
          />
        </div>
        <section className="vanx-identity-info" aria-label="Identidad del token">
          <p>VΛNX <span>Marca visual</span></p>
          <p>VANX <span>Símbolo ERC-20</span></p>
          <p>Polygon PoS <span>Red prevista</span></p>
          <p>Pendiente <span>Emisión en blockchain</span></p>
        </section>
        <section className="vanx-identity-copy">
          <h2>Un token propio. Una identidad distinta.</h2>
          <p>
            VANX es el token en preparación de VanDeFi. No es USDC, no está
            vinculado al dólar y todavía no tiene contrato desplegado,
            cotización pública ni mercado de compraventa.
          </p>
          <p>
            El modelo de venta inicial propuesto contempla dividir sus ingresos
            en USDC: 50% a una reserva bloqueada durante al menos 365 días y 50%
            a la tesorería designada. Aún no está activado.
          </p>
          <p>
            El mercado secundario, si llega a existir, tendrá precios determinados
            por compraventas y liquidez: puede subir o bajar. Sus operaciones no
            se reparten automáticamente según la regla de la venta inicial.
          </p>
        </section>
        <div className="vanx-notice">
          <strong>No se ha emitido VANX.</strong>
          <p>
            No envíes dinero a supuestos contratos VANX. Publicaremos la
            dirección verificada sólo después del despliegue y sus revisiones.
          </p>
        </div>
        <Link className="vanx-return" href="/">Volver a mi wallet USDC</Link>
      </div>
    </AppShell>
  );
}
