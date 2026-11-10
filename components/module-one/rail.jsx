"use client";
import { useEffect, useRef, useState } from "react";
import d from "./rail.module.css";

/* Riel horizontal para escritorio: flechas al pasar el mouse, arrastre con el
   puntero y rueda horizontal. En celular no cambia nada: el dedo ya desliza. */
export default function Deslizable({ className = "", children, paso = 0.85 }) {
  const ref = useRef(null);
  const el = ref;
  const [izq, setIzq] = useState(false);
  const [der, setDer] = useState(false);

  const medir = () => {
    const n = el.current; if (!n) return;
    setIzq(n.scrollLeft > 4);
    setDer(n.scrollLeft + n.clientWidth < n.scrollWidth - 4);
  };
  useEffect(() => {
    const n = el.current; if (!n) return;
    medir();
    n.addEventListener("scroll", medir, { passive: true });
    const ro = new ResizeObserver(medir); ro.observe(n);
    const mo = new MutationObserver(medir); mo.observe(n, { childList: true, subtree: true });
    return () => { n.removeEventListener("scroll", medir); ro.disconnect(); mo.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mover = (dir) => {
    const n = el.current; if (!n) return;
    n.scrollBy({ left: dir * n.clientWidth * paso, behavior: "smooth" });
  };

  // arrastre con mouse (solo puntero fino)
  const drag = useRef({ on: false, x: 0, sl: 0, movido: false });
  const onDown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const n = el.current; if (!n || n.scrollWidth <= n.clientWidth) return;
    drag.current = { on: true, x: e.clientX, sl: n.scrollLeft, movido: false };
  };
  const onMove = (e) => {
    const g = drag.current, n = el.current; if (!g.on || !n) return;
    const dx = e.clientX - g.x;
    if (!g.movido && Math.abs(dx) <= 4) return;
    g.movido = true;
    n.classList.add(d.arrastrando);
    n.scrollLeft = g.sl - dx;
  };
  const onUp = () => {
    const g = drag.current, n = el.current; if (!g.on) return;
    g.on = false; n && n.classList.remove(d.arrastrando);
    if (g.movido) {
      const bloquea = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      n && n.addEventListener("click", bloquea, { capture: true, once: true });
      setTimeout(() => n && n.removeEventListener("click", bloquea, { capture: true }), 0);
    }
  };

  return (
    <div className={d.caja}>
      <div ref={el} className={`${className} ${d.pista}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}>
        {children}
      </div>
      {izq && <button type="button" className={`${d.flecha} ${d.izq}`} onClick={() => mover(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>}
      {der && <button type="button" className={`${d.flecha} ${d.der}`} onClick={() => mover(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>}
    </div>
  );
}

