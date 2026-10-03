import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Local dev uses a SQLite file. For a deploy, point DATABASE_URL at a Turso
// database and set DATABASE_AUTH_TOKEN. Same code, same schema.
export const DATABASE_URL = process.env.DATABASE_URL ?? "file:./data/app.db";

const globalForDb = globalThis as unknown as { __libsql?: Client };

export const client =
  globalForDb.__libsql ??
  createClient({
    url: DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
if (process.env.NODE_ENV !== "production") globalForDb.__libsql = client;

export const db = drizzle(client, { schema });
export { schema };
