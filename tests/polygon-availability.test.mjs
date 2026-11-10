import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePolygonAvailability, readPolygonAvailability } from "../lib/polygon/availability.ts";

const realRequire = createRequire(import.meta.url);
function isolated(path, imports, globals = {}) {
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Response, URL,
    require: (name) => {
      if (name === "react" || name === "react/jsx-runtime") return realRequire(name);
      assert.ok(Object.hasOwn(imports, name), "unexpected real dependency: " + name);
      return imports[name];
    },
    ...globals,
  }, { timeout: 5000, filename: path });
  return exports;
}

function publicRoute(env) {
  const capabilities = isolated("lib/polygon/capabilities.ts", { "server-only": {} }, { process: { env } });
  return isolated("app/api/polygon/availability/route.ts", { "@/lib/polygon/capabilities": capabilities });
}

test("availability pública usa compuerta real, exige flag y RPC privado sin devolver secretos", async () => {
  for (const [env, expected] of [
    [{}, false],
    [{ ALCHEMY_API_KEY: "TEST_SECRET_NEVER_EXPOSE" }, false],
    [{ POLYGON_USDT_MAINNET_ENABLED: "true" }, false],
    [{ POLYGON_USDT_MAINNET_ENABLED: "true", POLYGON_RPC_URL: "http://private.test/TEST_SECRET_NEVER_EXPOSE" }, false],
    [{ POLYGON_USDT_MAINNET_ENABLED: "true", ALCHEMY_API_KEY: "TEST_SECRET_NEVER_EXPOSE" }, true],
    [{ POLYGON_USDT_MAINNET_ENABLED: "true", POLYGON_RPC_URL: "https://private.test/TEST_SECRET_NEVER_EXPOSE" }, true],
  ]) {
    const route = publicRoute(env);
    const response = route.GET();
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(route.dynamic, "force-dynamic");
    assert.deepEqual(JSON.parse(text), { network: "polygon", chainId: 137, asset: "USDT", sendEnabled: expected, receiveEnabled: expected });
    assert.equal(text.includes("TEST_SECRET"), false);
    assert.equal(text.includes("private.test"), false);
  }
});

function publicProxy(env) {
  let clerkCalls = 0;
  const next = () => Response.json({ next: true });
  const middleware = () => { clerkCalls++; return next(); };
  const route = isolated("proxy.ts", {
    "@clerk/nextjs/server": {
      createRouteMatcher: () => request => request.nextUrl.pathname.startsWith("/profile"),
      clerkMiddleware: () => middleware,
    },
    "next/server": { NextResponse: { next, json: Response.json.bind(Response), redirect: url => Response.redirect(url, 307) } },
  }, { process: { env } });
  return {
    calls: () => clerkCalls,
    request: (pathname, method = "GET") => route.default({ method, nextUrl: { pathname }, url: "https://example.test" + pathname }, {}),
  };
}

test("solo GET y HEAD del endpoint exacto son públicos aun sin configuración Clerk", async () => {
  const proxy = publicProxy({});
  for (const method of ["GET", "HEAD"]) {
    const response = proxy.request("/api/polygon/availability", method);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).next, true);
  }
  for (const path of ["/api/polygon/availability-extra", "/api/polygon/availability/", "/api/polygon/availability/private", "/api/polygon%2Favailability", "/api/chain/polygon", "/api/send/polygon/broadcast"]) {
    assert.equal(proxy.request(path).status, 503, path);
  }
  assert.equal(proxy.request("/api/polygon/availability", "POST").status, 503);
  assert.equal(proxy.request("/profile").status, 307);
  assert.equal(proxy.calls(), 0);
});

test("availability no consulta identidad aunque Clerk esté configurado; otras rutas conservan middleware", () => {
  const proxy = publicProxy({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "TEST_PUBLIC", CLERK_SECRET_KEY: "TEST_SECRET" });
  assert.equal(proxy.request("/api/polygon/availability").status, 200);
  assert.equal(proxy.calls(), 0);
  proxy.request("/api/chain/polygon");
  assert.equal(proxy.calls(), 1);
});

test("respuesta ausente, inconsistente o de otra red queda desconocida y cerrada", () => {
  const valid = { network: "polygon", chainId: 137, asset: "USDT", sendEnabled: false, receiveEnabled: false };
  assert.equal(parsePolygonAvailability(valid), "paused");
  assert.equal(parsePolygonAvailability({ ...valid, sendEnabled: true, receiveEnabled: true }), "enabled");
  for (const value of [null, undefined, "enabled", {}, { ...valid, sendEnabled: true }, { ...valid, sendEnabled: "false" }, { ...valid, chainId: 8453 }, { ...valid, network: "base" }, { ...valid, asset: "USDC" }]) {
    assert.equal(parsePolygonAvailability(value), "unknown");
  }
});

test("HTTP fallido, JSON inválido, timeout y red ausente no se confunden con pausa confirmada", async () => {
  const signal = new AbortController().signal;
  for (const fetcher of [
    async () => { throw new Error("offline"); },
    async () => { throw new DOMException("Timed out", "AbortError"); },
    async () => new Response("unavailable", { status: 503 }),
    async () => new Response("{invalid", { status: 200 }),
  ]) assert.equal(await readPolygonAvailability(signal, fetcher), "unknown");
  const response = await readPolygonAvailability(signal, async (url, options) => {
    assert.equal(url, "/api/polygon/availability");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal, signal);
    return Response.json({ network: "polygon", chainId: 137, asset: "USDT", sendEnabled: false, receiveEnabled: false });
  });
  assert.equal(response, "paused");
});

function publicUi(path, state, name, props = {}) {
  const notice = isolated("components/wallet/polygon-availability.tsx", {}).PolygonAvailabilityNotice;
  const Button = ({ href, children }) => React.createElement(href ? "a" : "button", href ? { href } : {}, children);
  const empty = () => null;
  const imports = {
    "next/link": Button,
    "@/lib/polygon/use-availability": { usePolygonAvailability: () => state },
    "@/components/wallet/polygon-availability": { PolygonAvailabilityNotice: notice },
    "@clerk/nextjs": { useAuth: () => {
      // Reading anonymous Clerk state isolates the balance; it is not a wallet request.
      if (path === "components/wallet/simple-usdc.tsx") return { userId: null, isLoaded: true };
      throw new Error("Paused Send/Receive must not mount authenticated wallet components");
    } },
    "@/components/mode/wallet-mode": { useWalletMode: () => ({ mode: "simple", setMode: empty }) },
    "@/lib/auth-config": { authConfigured: true },
    "@/components/ui/press-button": { PressButton: Button },
    "@/components/wallet/recover-device": { RecoverDevice: empty },
    "@/components/wallet/export-wallet": { ExportWallet: empty },
    "@/components/wallet/device-check": { DeviceCheck: empty },
    "@/lib/wallet/request-wallet": {},
    "@/components/wallet/operation-monitor": { OperationMonitor: empty },
    "@/lib/operations/tracker": {},
    "@/lib/send/polygon-tx": {},
    "@/components/brand/logo": { Wordmark: empty, Logo: empty },
    "@/components/icons": { Icon: empty },
    "@/components/design/usdc-operations": { USDTOperationBar: () => { throw new Error("Financial actions must stay hidden"); } },
    viem: {}, qrcode: {},
  };
  const Component = isolated(path, imports, {
    fetch: () => { throw new Error("Public UI tests must not make a real or private request"); },
  })[name];
  return renderToStaticMarkup(React.createElement(Component, { availability: state, ...props }));
}

test("Send y Receive muestran pausa o incertidumbre antes del acceso, sin QR ni instrucciones POL", () => {
  for (const state of ["paused", "unknown", "loading"]) {
    for (const [path, name] of [["components/wallet/send-polygon.tsx", "SendPolygonUSDT"], ["components/wallet/receive.tsx", "ReceivePanel"]]) {
      const html = publicUi(path, state, name);
      assert.match(html, state === "paused" ? /Envíos y depósitos en Polygon en pausa/ : state === "unknown" ? /Disponibilidad de Polygon sin comprobar/ : /Comprobando disponibilidad/);
      assert.doesNotMatch(html, /href="\/login|<img|comisión en POL|Se requiere POL/);
    }
  }
});

test("Inicio conserva consulta y oculta operaciones, promesas y gas mientras Polygon no está habilitado", () => {
  for (const state of ["paused", "unknown", "loading"]) {
    const html = publicUi("components/wallet/simple-usdc.tsx", state, "SimpleUSDTWallet");
    assert.match(html, /Consulta tu wallet/);
    assert.match(html, /href="\/activity"/);
    assert.doesNotMatch(html, /Compra\. Envía\. Retira\.|Para enviar USDT|href="\/receive"/);
    assert.ok(html.indexOf('role="status"') < html.indexOf('aria-label="USDT real en Polygon"'));
    const login = html.indexOf('href="/login"');
    assert.ok(login >= 0, "anonymous balance offers access only for consultation");
    assert.ok(html.indexOf('role="status"') < login, "availability notice precedes login");
  }
});

test("Cuenta explica copiar para consulta y conserva Bitcoin histórico sin ofrecer depósitos Polygon", () => {
  const html = publicUi("components/wallet/setup.tsx", "paused", "WalletSetupView", {
    status: { canActivate: false, transfersEnabled: false, wallet: {
      organizationId: "test_org", turnkeyUserId: "test_user", networks: ["Polygon", "Bitcoin"],
      evmAddress: "0x1111111111111111111111111111111111111111", bitcoinAddress: "bc1testonly",
    } },
    error: "", busy: false, verified: true, userId: "user_test123", expert: true,
    onRecovered() {}, onConnect() {}, onRetry() {},
  });
  assert.match(html, /Polygon PoS · consulta e historial/);
  assert.match(html, /Copiarla no habilita depósitos/);
  assert.match(html, /Bitcoin · histórico/);
  assert.match(html, /Copiar/);
});

test("Cuenta sin wallet con altas detenidas no promete creación ni ofrece reintento de activación", () => {
  const html = publicUi("components/wallet/setup.tsx", "paused", "WalletSetupView", {
    status: { canActivate: false, transfersEnabled: false, wallet: null },
    error: "", busy: false, verified: null, userId: "user_test123",
    onRecovered() {}, onConnect() {}, onRetry() {},
  });
  assert.match(html, /Nuevas wallets en pausa/);
  assert.doesNotMatch(html, /se crea automáticamente|generamos tu wallet|Reintentar activación/);
});

test("a signed-in user can request enrollment explicitly when openings are enabled", () => {
  const html = publicUi("components/wallet/setup.tsx", "enabled", "WalletSetupView", {
    status: { canActivate: true, transfersEnabled: true, wallet: null }, error: "", busy: false,
    verified: null, userId: "test-owner", onRecovered() {}, onConnect() {}, onRetry() {},
  });
  assert.match(html, /Solicitar mi wallet/);
  assert.doesNotMatch(html, /automáticamente/);
});
