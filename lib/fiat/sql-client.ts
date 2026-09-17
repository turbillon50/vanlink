/**
 * lib/fiat/sql-client.ts
 * Adaptador: expone la misma API de tagged-template que @neondatabase/serverless
 * (sql`...` -> filas), pero por debajo usa el pool de pg + drizzle que YA usa
 * el repo (lib/db). Así activity-store.ts no necesita un driver aparte ni una
 * segunda conexión a Neon.
 */
import "server-only";
import { sql as dsql } from "drizzle-orm";
import { db } from "@/lib/db";

export type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

export function sqlClient(): SqlTag {
  return async (strings, ...values) => {
    // undefined -> null: drizzle omite el placeholder cuando el valor es
    // undefined y deja el SQL roto (VALUES ($1, $2, , $3)). El driver de
    // Neon lo trataba como NULL; aquí lo normalizamos para igualar ese
    // comportamiento y que la consulta siga siendo válida.
    const safe = values.map(v => (v === undefined ? null : v));
    const query = dsql(strings, ...safe);
    const result = await db().execute(query);
    return (result as unknown as { rows: Record<string, unknown>[] }).rows ?? [];
  };
}
