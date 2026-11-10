import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const example = {
  id: "0x" + "a".repeat(64), network: "polygon", label: "10 USDT", direction: "out",
  createdAt: "2026-11-09T22:00:00Z", phase: "pending", confirmations: 0, checkedAt: null,
};

/** Render the real Activity page and wallet components with explicit loaded hook state.
 * Authentication and IO are isolated; SSR never runs effects or requests live wallet data.
 */
function renderActivity({ userId = "user_test123", isLoaded = true, configured = true,
  operations = [], movements = [], historyState = "listo", compact = false } = {}) {
  const cache = new Map();
  const react = {
    ...React,
    useState(initial) {
      if (Array.isArray(initial) && initial.length === 0) return React.useState(operations);
      if (initial === null) return React.useState({ wallet: {}, movements });
      if (initial === "cargando") return React.useState(historyState);
      return React.useState(initial);
    },
  };
  const sourcePaths = {
    "@/components/wallet/activity-list": "components/wallet/activity-list.tsx",
    "@/components/wallet/operation-monitor": "components/wallet/operation-monitor.tsx",
    "@/lib/operations/tracker": "lib/operations/tracker.ts",
  };
  const imports = {
    react,
    "react/jsx-runtime": jsxRuntime,
    "@clerk/nextjs": { useAuth: () => ({ userId, isLoaded }) },
    "@/lib/auth-config": { authConfigured: configured },
    "@/components/app-shell": { AppShell: ({ children }) => React.createElement("main", {}, children) },
    "@/components/top-bar": { TopBar: () => null },
    "@/components/craft": { PageIntro: ({ eyebrow, title, description }) => React.createElement("header", {},
      React.createElement("p", {}, eyebrow), React.createElement("h1", {}, title), React.createElement("p", {}, description)) },
    "@/components/icons": { Icon: () => React.createElement("span", { "aria-hidden": "true" }, "↗") },
  };
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    const compiled = ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url), "utf8"), {
      fileName: path,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, { exports, URLSearchParams,
      require(name) {
        if (Object.hasOwn(imports, name)) return imports[name];
        if (Object.hasOwn(sourcePaths, name)) return load(sourcePaths[name]);
        assert.fail("unexpected activity dependency: " + name);
      },
    }, { filename: path });
    return exports;
  }
  const Component = compact
    ? load("components/wallet/operation-monitor.tsx").OperationMonitor
    : load("app/activity/page.tsx").default;
  return renderToStaticMarkup(React.createElement(Component, compact ? { compact: true } : {}));
}

function saveFixture(name, html) {
  if (!process.env.ACTIVITY_RENDER_DIR) return;
  mkdirSync(process.env.ACTIVITY_RENDER_DIR, { recursive: true });
  writeFileSync(process.env.ACTIVITY_RENDER_DIR + "/" + name + ".html", "<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content='width=device-width, initial-scale=1'><title>Activity component verification</title><body>" + html + "</body></html>");
}

test("sin movimientos el historial precede la consulta secundaria cerrada y no asegura éxito", () => {
  const html = renderActivity();
  assert.ok(html.indexOf("Historial de movimientos") < html.indexOf("<details"));
  assert.ok(html.indexOf("Todavía no hay movimientos.") < html.indexOf("Comprobar un movimiento"));
  assert.match(html, /<summary[^>]*>Comprobar un movimiento<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:[\s=>])/);
  assert.doesNotMatch(html, /TODO EN ORDEN|BLOCKCHAIN|REGISTROS DE CADENA/);
  assert.match(html, /Identificador del depósito/);
  saveFixture("empty", html);
});

test("sin sesión conserva acceso al historial y su explicación sin formulario o filtros engañosos", () => {
  const html = renderActivity({ userId: null });
  assert.match(html, /Tu actividad/);
  assert.match(html, /Historial de movimientos/);
  assert.match(html, /Inicia sesión o entra a tu wallet para consultar los movimientos/);
  assert.doesNotMatch(html, /<form|<details|Filtrar movimientos|10 USDT/);
  saveFixture("guest", html);
});

test("auth sin cargar muestra carga sin datos de otra cuenta ni consulta manual", () => {
  const html = renderActivity({ isLoaded: false, operations: [example] });
  assert.match(html, /Cargando movimientos/);
  assert.doesNotMatch(html, /<details|10 USDT|TODO EN ORDEN/);
});

test("movimiento pendiente y aviso de no repetir permanecen delante del historial y fuera de details", () => {
  const html = renderActivity({ operations: [example] });
  const history = html.indexOf('aria-label="Historial de movimientos"');
  assert.ok(html.indexOf("Envío 10 USDT") < history);
  assert.ok(html.indexOf("No repitas una transferencia pendiente") < history);
  assert.ok(history < html.indexOf("<details"));
  assert.match(html, /1 por verificar/);
  assert.match(html, /https:\/\/polygonscan.com\/tx\/0x[a-f0-9]{64}/);
  saveFixture("pending", html);
});

test("historial cargado muestra importe y dirección antes de cualquier campo técnico", () => {
  const html = renderActivity({ movements: [{ id: "movement_test", network: "Polygon", direction: "in",
    token: "USDT", amount: "2", counterparty: null, at: "2026-11-09T22:00:00Z", confirmed: true,
    explorer: "https://polygonscan.com/tx/" + example.id }] });
  assert.match(html, /Recibiste USDT/);
  assert.match(html, /\+2/);
  assert.ok(html.indexOf("Recibiste USDT") < html.indexOf("<details"));
});

test("error al cargar historial no se transforma en estado vacío o todo correcto", () => {
  const html = renderActivity({ historyState: "error" });
  assert.match(html, /No pudimos leer tu actividad ahora/);
  assert.doesNotMatch(html, /Todavía no hay movimientos|TODO EN ORDEN/);
  assert.match(html, /Comprobar un movimiento/);
});

test("monitor compacto conserva pendiente y advertencia sin agregar consulta técnica", () => {
  const html = renderActivity({ compact: true, operations: [example] });
  assert.match(html, /Envío 10 USDT/);
  assert.match(html, /1 por verificar/);
  assert.match(html, /No repitas una transferencia pendiente/);
  assert.doesNotMatch(html, /<form|<details/);
});
