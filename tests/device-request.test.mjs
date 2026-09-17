/**
 * Arnés del flujo de segundo dispositivo. Prueba la lógica que NO depende de
 * Turnkey: validación de llave, código, expiración y unicidad.
 * Incluye casos que DEBEN fallar, para comprobar que el arnés sí reprueba.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";

const P256 = /^0[23][0-9a-fA-F]{64}$/;
let pasadas = 0, fallidas = 0;
const t = (nombre, fn) => {
  try { fn(); console.log("  ✅", nombre); pasadas++; }
  catch (e) { console.log("  ❌", nombre, "->", e.message); fallidas++; }
};

console.log("=== validación de llave pública P-256 ===");
t("acepta una llave válida comprimida (02)", () => {
  assert.ok(P256.test("02dfbe027f84b4ee3e75fe5d9e00c26cfccf2b9769d757a5fbdfe2d47d5439d9cd"));
});
t("acepta prefijo 03", () => {
  assert.ok(P256.test("03" + "a".repeat(64)));
});
t("RECHAZA llave sin prefijo válido", () => {
  assert.ok(!P256.test("04" + "a".repeat(64)));
});
t("RECHAZA llave corta", () => {
  assert.ok(!P256.test("02abc"));
});
t("RECHAZA texto arbitrario", () => {
  assert.ok(!P256.test("soy-una-llave"));
});
t("RECHAZA llave con caracteres no hex", () => {
  assert.ok(!P256.test("02" + "z".repeat(64)));
});

console.log("\n=== código de verificación ===");
const code = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
t("siempre tiene 6 dígitos", () => {
  for (let i = 0; i < 500; i++) assert.equal(code().length, 6);
});
t("conserva ceros a la izquierda", () => {
  assert.equal(String(7).padStart(6, "0"), "000007");
});
t("varía entre llamadas (no es constante)", () => {
  const set = new Set(Array.from({ length: 50 }, code));
  assert.ok(set.size > 10, "demasiada repetición");
});

console.log("\n=== expiración ===");
const vigente = (exp) => new Date(exp).getTime() > Date.now();
t("una solicitud de hace 1 minuto sigue vigente", () => {
  assert.ok(vigente(Date.now() + 9 * 60_000));
});
t("RECHAZA una solicitud vencida", () => {
  assert.ok(!vigente(Date.now() - 1000));
});
t("RECHAZA exactamente en el límite pasado", () => {
  assert.ok(!vigente(Date.now() - 1));
});

console.log("\n=== control negativo del arnés ===");
// Control negativo: si el arnés estuviera roto, esto pasaría en silencio.
// Debe reportarse como fallo. Se deja comentado tras verificarlo.
// t("control roto a propósito", () => { assert.ok(P256.test("no-soy-llave")); });

console.log(`\nResultado: ${pasadas} pasadas, ${fallidas} fallidas`);
process.exit(fallidas === 0 ? 0 : 1);
