import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const paths = { home: "components/wallet/simple-usdc.tsx", receive: "components/wallet/receive.tsx" };
const code = Object.fromEntries(Object.entries(paths).map(([kind, path]) => [kind,
  ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url), "utf8"), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText]));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

/** Run real component effects against controlled IO, without React DOM or live services. */
function environment(kind) {
  let auth = { userId: "user_accountA", isLoaded: true };
  let rendering = null;
  const requests = [];
  const element = (type, props, key) => ({ type, props: props || {}, key: key ?? null });
  const react = {
    useState(initial) {
      assert.ok(rendering, "stateful component requires a test mount");
      const mount = rendering; const index = mount.cursor++;
      if (!Object.hasOwn(mount.values, index)) mount.values[index] = typeof initial === "function" ? initial() : initial;
      return [mount.values[index], value => {
        mount.values[index] = typeof value === "function" ? value(mount.values[index]) : value;
        mount.updates.push(index);
      }];
    },
    useEffect(effect, dependencies) {
      const mount = rendering; const index = mount.cursor++;
      const old = mount.dependencies[index];
      if (!old || dependencies.some((value, i) => value !== old[i])) {
        mount.dependencies[index] = dependencies;
        mount.effects.push(effect);
      }
    },
    useMemo: factory => factory(),
  };
  const imports = {
    react, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/link": { __esModule: true, default: "a" },
    "@clerk/nextjs": { useAuth: () => auth },
    "@/lib/auth-config": { authConfigured: true },
    "@/components/wallet/polygon-availability": { PolygonAvailabilityNotice: () => null },
    "@/components/brand/logo": { Wordmark: () => null },
    "@/components/icons": { Icon: () => null },
    "@/components/design/usdc-operations": { USDTOperationBar: () => null },
    "@/lib/polygon/use-availability": { usePolygonAvailability: () => "enabled" },
    qrcode: { toDataURL: async () => "data:image/png;base64,test-only" },
  };
  const exports = {};
  vm.runInNewContext(code[kind], {
    exports, AbortController, Intl, navigator: { clipboard: {} },
    window: { addEventListener() {}, removeEventListener() {}, setInterval: () => 1, setTimeout: () => 1 },
    clearInterval() {},
    fetch: (url, init) => {
      const response = deferred(); const body = deferred();
      const request = { url, init, response, body };
      requests.push(request); return response.promise;
    },
    require: name => { assert.ok(Object.hasOwn(imports, name), "unexpected import " + name); return imports[name]; },
  });
  const Component = kind === "home" ? exports.SimpleUSDTWallet : exports.ReceivePanel;
  const leafName = kind === "home" ? "SimpleUSDTWalletForUser" : "ReceivePanelInner";
  function find(node) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) return node.map(find).find(Boolean) || null;
    if (typeof node.type === "function") {
      if (node.type.name === leafName) return node;
      return find(node.type(node.props));
    }
    return find(node.props?.children);
  }
  function leaf(userId, isLoaded = true, historical = false) {
    auth = { userId, isLoaded };
    return find(Component({ availability: "enabled", historical }));
  }
  function mount(node) {
    const current = { values: [], updates: [], dependencies: [], effects: [], cleanups: [], cursor: 0 };
    current.render = () => {
      rendering = current; current.cursor = 0;
      try { return node.type(node.props); } finally { rendering = null; }
    };
    current.start = () => { current.render(); for (const effect of current.effects.splice(0)) current.cleanups.push(effect()); };
    current.cleanup = () => { for (const cleanup of current.cleanups) if (typeof cleanup === "function") cleanup(); };
    return current;
  }
  return { leaf, mount, requests };
}

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" ? text(node.props?.children) : "";
}

test("Home and Receive remount account A, account B, guest and loading before any effects", () => {
  for (const kind of ["home", "receive"]) {
    const e = environment(kind);
    assert.deepEqual([e.leaf("user_accountA").key, e.leaf("user_accountB").key,
      e.leaf(null).key, e.leaf("user_accountB", false).key], ["user_accountA", "user_accountB", "guest", "loading"]);
    assert.equal(e.requests.length, 0);
  }
});

test("Switching between Polygon and historical networks remounts the address panel", () => {
  const e = environment("receive");
  const polygon = e.leaf("user_accountA");
  const historical = e.leaf("user_accountA", true, true);
  assert.notEqual(polygon.key, historical.key);
  assert.equal(historical.props.historical, true);
  assert.equal(e.requests.length, 0);
});

test("Home aborts account A and ignores its late balance while account B displays only its own balance", async () => {
  const e = environment("home");
  const a = e.mount(e.leaf("user_accountA")); a.start();
  assert.equal(e.requests[0].url, "/api/chain/polygon");
  e.requests[0].response.resolve({ ok: true, status: 200, json: () => e.requests[0].body.promise });
  await flush(); a.cleanup();
  assert.equal(e.requests[0].init.signal.aborted, true);
  const updatesAfterCleanup = a.updates.length;
  const b = e.mount(e.leaf("user_accountB")); b.start();
  e.requests[1].response.resolve({ ok: true, status: 200, json: () => e.requests[1].body.promise });
  e.requests[0].body.resolve({ wallet: { evmAddress: "0x" + "aa".repeat(20) }, polygon: { token: "USDT", amount: "91.23", polGasBalance: "1" } });
  e.requests[1].body.resolve({ wallet: { evmAddress: "0x" + "bb".repeat(20) }, polygon: { token: "USDT", amount: "27.45", polGasBalance: "1" } });
  await flush();
  assert.equal(a.updates.length, updatesAfterCleanup);
  const visible = text(b.render());
  assert.match(visible, /27\.45/); assert.doesNotMatch(visible, /91\.23/);
  b.cleanup();
});

test("Receive aborts account A and ignores its late address while account B displays only its own address", async () => {
  const e = environment("receive");
  const a = e.mount(e.leaf("user_accountA")); a.start();
  assert.equal(e.requests[0].url, "/api/chain/balance");
  e.requests[0].response.resolve({ ok: true, status: 200, json: () => e.requests[0].body.promise });
  await flush(); a.cleanup();
  assert.equal(e.requests[0].init.signal.aborted, true);
  const updatesAfterCleanup = a.updates.length;
  const b = e.mount(e.leaf("user_accountB")); b.start();
  e.requests[1].response.resolve({ ok: true, status: 200, json: () => e.requests[1].body.promise });
  const addressA = "0x" + "aa".repeat(20); const addressB = "0x" + "bb".repeat(20);
  e.requests[0].body.resolve({ wallet: { evmAddress: addressA, bitcoinAddress: "bc1-account-a" } });
  e.requests[1].body.resolve({ wallet: { evmAddress: addressB, bitcoinAddress: "bc1-account-b" } });
  await flush();
  assert.equal(a.updates.length, updatesAfterCleanup);
  const visible = nodes(b.render());
  assert.ok(visible.some(node => node.type === "code" && node.props.title === addressB));
  assert.ok(!visible.some(node => node.props?.title === addressA));
  b.cleanup();
});

test("Home guest performs no private balance request and displays a sign-in state", () => {
  const e = environment("home");
  const guest = e.mount(e.leaf(null)); guest.start();
  assert.equal(e.requests.length, 0);
  assert.match(text(guest.render()), /Inicia sesión para consultar tu USDT/);
  guest.cleanup();
});
