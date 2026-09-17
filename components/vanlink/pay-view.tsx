"use client";

/**
 * components/vanlink/pay-view.tsx
 * Pantalla PÚBLICA de cobro. Sin sesión, sin registro: quien recibe el link
 * ve monto, red, dirección y QR, y paga desde la wallet que ya use.
 *
 * Criterio: la red se anuncia enorme y en color, porque el error más caro del
 * usuario es pagar por la cadena equivocada.
 */

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

type VanLink = {
  slug: string; asset: string; network: string; address: string;
  amount: string | null; concept: string | null; status: string;
  uri: string; expiresAt: string | null;
};
type Pago = { tx: string; amount: string; confirmed: boolean } | null;
type Via = "cripto" | "tarjeta" | "cuenta";

export function PayView({ slug }: { slug: string }) {
  const [link, setLink] = useState<VanLink | null>(null);
  const [pago, setPago] = useState<Pago>(null);
  const [state, setState] = useState<"cargando" | "listo" | "no-existe" | "error">("cargando");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [via, setVia] = useState<Via>("cripto");
  const [rampaLista, setRampaLista] = useState<boolean | null>(null);
  const [guia, setGuia] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/vanlink/${slug}`, { cache: "no-store" });
      if (r.status === 404) { setState("no-existe"); return; }
      if (!r.ok) throw new Error("link");
      const d = (await r.json()) as { vanlink: VanLink; pago: Pago };
      setLink(d.vanlink);
      setPago(d.pago);
      setState("listo");
    } catch { setState("error"); }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  // Mientras esté activo, revisa si ya entró el pago.
  useEffect(() => {
    if (!link || link.status !== "activo") return;
    const timer = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(timer);
  }, [link, load]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/onramp/status?direction=up", { cache: "no-store" });
        const d = (await r.json()) as { available?: boolean };
        setRampaLista(Boolean(d.available));
      } catch { setRampaLista(false); }
    })();
  }, []);

  useEffect(() => {
    if (!link) return;
    let active = true;
    void QRCode.toDataURL(link.uri, {
      margin: 1, width: 512, errorCorrectionLevel: "M",
      color: { dark: "#f7fbff", light: "#00000000" },
    }).then((u) => { if (active) setQr(u); }).catch(() => undefined);
    return () => { active = false; };
  }, [link]);

  if (state === "cargando") return <main className="pay-shell"><div className="pay-skeleton" /></main>;
  if (state === "no-existe") {
    return (
      <main className="pay-shell">
        <div className="pay-card pay-void">
          <h1>Este link no existe</h1>
          <p>Puede haber sido cancelado o escrito mal. Pídele al cobrador que lo genere otra vez.</p>
        </div>
      </main>
    );
  }
  if (state === "error" || !link) {
    return (
      <main className="pay-shell">
        <div className="pay-card pay-void">
          <h1>No pudimos cargar el cobro</h1>
          <p>Vuelve a intentarlo en un momento.</p>
        </div>
      </main>
    );
  }

  const pagado = link.status === "pagado";
  const cerrado = link.status === "expirado" || link.status === "cancelado";

  return (
    <main className="pay-shell">
      <header className="pay-brand">VanDeFi</header>

      <div className={pagado ? "pay-card pay-done" : "pay-card"}>
        {pagado ? (
          <>
            <span className="pay-check" aria-hidden="true">✓</span>
            <h1>Pago recibido</h1>
            {pago ? <p>Se confirmó en la red {link.network}.</p> : null}
            {pago ? <a className="pay-explorer" href={pago.tx} target="_blank" rel="noopener noreferrer">Ver en el explorador</a> : null}
          </>
        ) : cerrado ? (
          <>
            <h1>Este cobro ya no está activo</h1>
            <p>{link.status === "expirado" ? "El link expiró." : "El cobro fue cancelado."}</p>
          </>
        ) : (
          <>
            <p className="pay-eyebrow">TE ESTÁN COBRANDO</p>
            {link.amount ? (
              <div className="pay-amount"><strong>{link.amount}</strong><span>{link.asset}</span></div>
            ) : (
              <div className="pay-amount"><strong>Monto libre</strong></div>
            )}
            {link.concept ? <p className="pay-concept">{link.concept}</p> : null}

            <div className="pay-vias" role="tablist" aria-label="Cómo quieres pagar">
              <button role="tab" type="button" aria-selected={via === "cripto"}
                className={via === "cripto" ? "pay-via active" : "pay-via"}
                onClick={() => setVia("cripto")}>Ya tengo cripto</button>
              <button role="tab" type="button" aria-selected={via === "tarjeta"}
                className={via === "tarjeta" ? "pay-via active" : "pay-via"}
                onClick={() => setVia("tarjeta")}>Con tarjeta</button>
              <button role="tab" type="button" aria-selected={via === "cuenta"}
                className={via === "cuenta" ? "pay-via active" : "pay-via"}
                onClick={() => setVia("cuenta")}>Crear cuenta</button>
            </div>

            {via === "cripto" ? (<>
            <div className="pay-network">Red {link.network}</div>

            {qr ? (
              <img src={qr} alt="Código QR para pagar" className="pay-qr" />
            ) : (
              <div className="pay-qr pay-qr-loading" aria-hidden="true" />
            )}

            <code className="pay-address">{link.address}</code>

            <button
              type="button"
              className="pay-copy"
              onClick={() => {
                navigator.clipboard?.writeText(link.address).then(() => {
                  setCopied(true); window.setTimeout(() => setCopied(false), 1900);
                }).catch(() => undefined);
              }}
            >
              {copied ? "Dirección copiada" : "Copiar dirección"}
            </button>

            <button type="button" className="pay-guide-toggle" onClick={() => setGuia((g) => !g)}>
              {guia ? "Ocultar" : "¿Cómo pago desde Binance?"}
            </button>
            {guia ? (
              <ol className="pay-guide">
                <li>Abre Binance y entra a <b>Billetera → Retirar</b>.</li>
                <li>Elige <b>{link.asset}</b>.</li>
                <li>Pega la dirección de arriba.</li>
                <li>En red elige <b>{link.network === "Base" ? "Base" : "BTC (Bitcoin)"}</b>. Si eliges otra, el dinero se pierde.</li>
                <li>Pon el monto y confirma. Llega en unos minutos.</li>
              </ol>
            ) : null}

            {pago && !pago.confirmed ? (
              <p className="pay-pending">Vimos un pago de {pago.amount}. Esperando confirmación de la red…</p>
            ) : (
              <p className="pay-waiting"><i aria-hidden="true" />Esperando el pago…</p>
            )}

            <p className="pay-warn">
              Envía únicamente {link.asset} por la red {link.network}. Enviar por otra red
              significa perder el dinero: nadie puede recuperarlo.
            </p>
            </>) : null}

            {via === "tarjeta" ? (
              rampaLista === null
                ? <div className="pay-qr pay-qr-loading" aria-hidden="true" />
                : rampaLista
                  ? <>
                      <p className="pay-concept">Compra {link.asset} con tarjeta y llega directo a este cobro.</p>
                      <a className="pay-copy pay-cta" href={"/api/onramp/widget?slug=" + link.slug}>Pagar con tarjeta</a>
                      <p className="pay-warn">
                        La compra la procesa un proveedor externo con sus comisiones y
                        verificación de identidad. VanDeFi no toca ese dinero.
                      </p>
                    </>
                  : <>
                      <p className="pay-concept">El pago con tarjeta aún no está disponible en este cobro.</p>
                      <p className="pay-soft">Mientras tanto puedes pagar con cripto desde la primera pestaña.</p>
                    </>
            ) : null}

            {via === "cuenta" ? (<>
              <p className="pay-concept">
                Crea tu VanDeFi, ten tu propia wallet y paga desde ahí. También podrás cobrar
                con tus propios links.
              </p>
              <a className="pay-copy pay-cta" href={"/sign-up?from=/l/" + link.slug}>Crear mi VanDeFi</a>
              <p className="pay-soft">
                Ojo: por este camino primero fondeas tu wallet y luego envías, o sea dos
                operaciones. Si solo quieres pagar, la vía más corta es con cripto o tarjeta.
              </p>
            </>) : null}
          </>
        )}
      </div>

      <footer className="pay-foot">
        VanDeFi no custodia este pago. Va directo del pagador al cobrador.
      </footer>
    </main>
  );
}
