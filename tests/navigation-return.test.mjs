import test from "node:test";
import assert from "node:assert/strict";
import { internalBackDestination, rememberInternalRoute, safeInternalPath } from "../lib/navigation/return-path.ts";

const origin = "https://vandefi.live";
const empty = () => ({ current: null, previous: null });
const visit = (state, path, referrer = "") => rememberInternalRoute(state, path, referrer, origin);

test("Inicio → Enviar → Volver conserva Inicio como origen", () => {
  let state = visit(empty(), "/");
  state = visit(state, "/send");
  assert.equal(internalBackDestination(state, "/send", "/operate"), "/");
});

test("Operar → Recibir → Volver conserva Operar como origen", () => {
  let state = visit(empty(), "/operate");
  state = visit(state, "/receive");
  assert.equal(internalBackDestination(state, "/receive", "/operate"), "/operate");
});

test("enlaces directos sin origen interno usan el destino seguro de reserva", () => {
  for (const path of ["/send", "/receive"]) {
    const state = visit(empty(), path);
    assert.equal(internalBackDestination(state, path, "/operate"), "/operate");
  }
});

test("un referente externo nunca se convierte en destino de Volver", () => {
  const state = visit(empty(), "/receive", "https://outside.invalid/operate");
  assert.equal(internalBackDestination(state, "/receive", "/operate"), "/operate");
});

test("navegación completa desde el mismo origen conserva su ruta interna", () => {
  const state = visit(empty(), "/receive", origin + "/operate?mode=expert");
  assert.equal(internalBackDestination(state, "/receive", "/operate"), "/operate?mode=expert");
});

test("el paso por acceso no reemplaza el origen al regresar a Enviar", () => {
  let state = visit(empty(), "/");
  state = visit(state, "/send");
  state = visit(state, "/login");
  state = visit(state, "/send");
  assert.equal(internalBackDestination(state, "/send", "/operate"), "/");
});

test("volver a observar la misma ruta no la convierte en su propio origen", () => {
  let state = visit(empty(), "/operate");
  state = visit(state, "/receive");
  const repeated = visit(state, "/receive");
  assert.deepEqual(repeated, state);
  assert.equal(internalBackDestination(repeated, "/receive", "/operate"), "/operate");
});

test("paths internos normales conservan búsqueda y fragmento y normalizan segmentos", () => {
  assert.equal(safeInternalPath("/activity?filter=in#latest"), "/activity?filter=in#latest");
  assert.equal(safeInternalPath("/operate/../send"), "/send");
});

test("bloquea protocolos externos, protocolos relativos y variantes codificadas", () => {
  for (const path of ["https://outside.invalid", "//outside.invalid", "javascript:alert(1)",
    "/\\outside.invalid", "/%5coutside.invalid", "/%2foutside.invalid", "/%252foutside.invalid",
    "/..//outside.invalid", "/foo/..//outside.invalid", "/send%0a", "/send\n", "/bad%ZZ"]) {
    assert.equal(safeInternalPath(path), null, path);
  }
});

test("datos inválidos o destino de reserva externo terminan en una ruta interna", () => {
  assert.equal(internalBackDestination({ current: "/send", previous: "//outside.invalid" }, "/send", "/operate"), "/operate");
  assert.equal(internalBackDestination(empty(), "/send", "https://outside.invalid"), "/");
  assert.equal(safeInternalPath(null), null);
  assert.equal(safeInternalPath(undefined), null);
});

test("carga fresca tras acceso ignora el referente de login y usa la reserva interna", () => {
  for (const destination of ["/send", "/receive"]) {
    for (const authPath of ["/login", "/login/continue", "/sign-in", "/sign-up"]) {
      const state = visit(empty(), destination, origin + authPath + "?redirect_url=" + encodeURIComponent(destination));
      assert.equal(state.previous, null);
      assert.equal(internalBackDestination(state, destination, "/operate"), "/operate");
    }
  }
});
