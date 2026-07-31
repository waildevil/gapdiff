import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, runScript, usingPglite, PGLITE_DIR } from '@/db';

/**
 * Drops every table and starts over.
 *
 * Only match data is expensive to lose, and all of it is re-fetchable from Riot
 * — so this is the honest way out of a tangled migration rather than
 * hand-editing drizzle's snapshots.
 *
 *   npm run db:reset -- --yes
 */
async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('This drops every table. Re-run with --yes to confirm.');
    console.error(
      usingPglite ? `Target: local PGlite at ${PGLITE_DIR}` : 'Target: hosted Postgres',
    );
    process.exitCode = 1;
    return;
  }

  console.log(usingPglite ? `Resetting PGlite at ${PGLITE_DIR}` : 'Resetting hosted Postgres');

  // `drizzle` holds the migration journal; dropping it too means the next
  // migrate run starts from a genuinely clean slate.
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);

  console.log('Done. Next: npm run db:migrate');
}

void runScript(main);
