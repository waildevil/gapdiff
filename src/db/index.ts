import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Two drivers, one API.
 *
 * With DATABASE_URL set, this talks to a hosted Postgres (Neon, Supabase, or
 * anything else). Without it, it falls back to PGlite — real Postgres compiled
 * to WASM, running in-process against a local folder. That means migrations,
 * seeding and ingestion all work with no install and no signup, and moving to a
 * hosted database later is one environment variable.
 *
 * Both are typed as PgDatabase so callers never care which is underneath.
 */

/**
 * Absolute by default. The dev server and the CLI scripts run with different
 * working directories, and a relative path quietly opens two separate databases
 * — migrations land in one, the app reads the other, and every query 404s.
 */
export const PGLITE_DIR =
  process.env.PGLITE_DIR ?? path.resolve(process.cwd(), '.pglite');

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export const usingPglite = !process.env.DATABASE_URL;

const globalForDb = globalThis as unknown as {
  __gapdiffDb?: Database;
  __gapdiffPglite?: PGlite;
  __gapdiffPostgres?: ReturnType<typeof postgres>;
};

function createDatabase(): Database {
  const url = process.env.DATABASE_URL;

  if (url) {
    // Serverless platforms pool connections themselves; keep ours small.
    const client = globalForDb.__gapdiffPostgres ?? postgres(url, { max: 5, prepare: false });
    globalForDb.__gapdiffPostgres = client;
    return drizzlePostgres(client, { schema }) as unknown as Database;
  }

  const client = globalForDb.__gapdiffPglite ?? new PGlite(PGLITE_DIR);
  globalForDb.__gapdiffPglite = client;
  return drizzlePglite(client, { schema }) as unknown as Database;
}

/**
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool — or a second PGlite handle on the same folder — per edit.
 */
export const db: Database = globalForDb.__gapdiffDb ?? createDatabase();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__gapdiffDb = db;
}

/**
 * Shuts the database down cleanly. **Every CLI script must await this before
 * exiting.**
 *
 * PGlite keeps its Postgres cluster in memory and only writes a consistent
 * state on close. Calling `process.exit()` with a handle still open skips that
 * and leaves the data directory corrupt — it then refuses to boot at all, with
 * a bare `RuntimeError: Aborted()` from the WASM runtime and no way back.
 */
export async function closeDb(): Promise<void> {
  const pglite = globalForDb.__gapdiffPglite;
  if (pglite) {
    await pglite.close();
    globalForDb.__gapdiffPglite = undefined;
  }

  const sql = globalForDb.__gapdiffPostgres;
  if (sql) {
    await sql.end();
    globalForDb.__gapdiffPostgres = undefined;
  }

  globalForDb.__gapdiffDb = undefined;
}

/**
 * Wraps a script's main function so the database is always closed, whether it
 * succeeded, threw, or the process was interrupted.
 */
export async function runScript(main: () => Promise<void>): Promise<void> {
  let failed = false;

  const onSignal = () => {
    void closeDb().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    await main();
  } catch (error) {
    console.error(error);
    failed = true;
  } finally {
    await closeDb();
  }

  process.exit(failed ? 1 : 0);
}

export { schema };
