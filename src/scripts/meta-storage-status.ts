import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, runScript } from '@/db';

async function main() {
  const result = await db.execute(sql`
    SELECT
      pg_size_pretty(pg_database_size(current_database())) AS database_size,
      pg_size_pretty(pg_total_relation_size('meta_sample_matches')) AS meta_samples_size,
      (SELECT count(*)::int FROM meta_sample_matches) AS sample_matches,
      (SELECT count(*)::int FROM meta_champion_observations) AS observations,
      (SELECT count(*)::int FROM meta_champion_bans) AS bans,
      (SELECT count(*)::int FROM meta_match_cohorts) AS cohorts
  `) as unknown;
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
  console.log(rows[0] ?? {});
}

void runScript(main);
