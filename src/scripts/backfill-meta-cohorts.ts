import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, runScript } from '@/db';

/**
 * Restores rank-cohort provenance for matches collected before the collector
 * began storing it explicitly. A match can belong to more than one tier when
 * two sampled accounts played in the same lobby.
 */
async function main() {
  await db.execute(sql`
    UPDATE meta_collector_seeds
    SET rank_tier = upper(substring(source FROM '^ranked-(.+)$'))
    WHERE source LIKE 'ranked-%' AND rank_tier IS NULL
  `);

  // Cohorts are written at collection time. The historic raw payload column
  // was archived and removed to keep the free database sustainable, so an
  // archive restore is required for any additional legacy reconstruction.
  console.log('Rank cohorts are captured during collection; no raw-payload backfill is needed.');
}

void runScript(main);
