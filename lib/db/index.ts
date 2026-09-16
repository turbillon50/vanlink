import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";

let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("Database unavailable");
  if (!database) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3,
      connectionTimeoutMillis: 8_000, idleTimeoutMillis: 5_000 });
    attachDatabasePool(pool);
    database = drizzle(pool, { schema });
  }
  return database;
}
