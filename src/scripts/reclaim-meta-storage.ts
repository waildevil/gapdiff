import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, runScript } from '@/db';

async function main() {
  // No table rewrite: this is safe on the free plan and lets Postgres release
  // now-unreferenced TOAST pages left behind after dropping the raw column.
  await db.execute(sql.raw('VACUUM (ANALYZE, VERBOSE) meta_sample_matches'));
  console.log('Public-meta storage vacuum completed. Run npm run meta:storage to inspect the result.');
}

void runScript(main);
