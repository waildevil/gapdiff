import 'dotenv/config';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { PGLITE_DIR } from '@/db';

/**
 * Applies the SQL in ./drizzle to whichever database is configured.
 *
 * drizzle-kit's own `migrate` command only speaks to a connection URL, so this
 * runs the migrator programmatically instead and works for both drivers.
 *
 *   npm run db:migrate
 */

// Must be absolute: a relative folder silently resolves to nothing and the
// migrator then reports success having applied zero migrations.
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle');

const EXPECTED_TABLES = [
  'account_claims',
  'accounts',
  'auth_accounts',
  'auth_sessions',
  'auth_users',
  'auth_verification_tokens',
  'group_memberships',
  'groups',
  'icon_challenges',
  'invites',
  'known_players',
  'match_participants',
  'matches',
  'rank_snapshots',
  'sync_state',
  'tracked_accounts',
];

async function main() {
  if (!existsSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))) {
    throw new Error(
      `No migrations found in ${MIGRATIONS_FOLDER}. Run \`npm run db:generate\` first.`,
    );
  }

  const url = process.env.DATABASE_URL;
  let tables: string[];

  if (url) {
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return 'the configured host';
      }
    })();
    console.log(`Migrating hosted Postgres at ${host}`);

    const client = postgres(url, { max: 1 });
    const db = drizzlePostgres(client);
    await migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER });
    tables = await listTables(db);
    await client.end();
  } else {
    console.log(`Migrating local PGlite database at ${PGLITE_DIR}`);
    console.log('(set DATABASE_URL in .env to use a hosted Postgres instead)');

    const client = new PGlite(PGLITE_DIR);
    const db = drizzlePglite(client);
    await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
    tables = await listTables(db);
    await client.close();
  }

  const missing = EXPECTED_TABLES.filter((name) => !tables.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `Migration reported success but these tables are missing: ${missing.join(', ')}`,
    );
  }

  console.log(`Migrations applied. ${tables.length} tables: ${tables.join(', ')}`);
}

async function listTables(db: {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}): Promise<string[]> {
  const result = (await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
  )) as unknown;

  // postgres-js returns an array; PGlite returns { rows: [...] }.
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] }).rows ?? []);

  return rows.map((row) => String((row as { table_name: string }).table_name));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
