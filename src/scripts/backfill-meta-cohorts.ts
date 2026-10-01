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

  const inserted = await db.execute(sql`
    INSERT INTO meta_match_cohorts (match_id, seed_puuid, tier, division)
    SELECT sm.match_id, s.puuid, s.rank_tier, s.rank_division
    FROM meta_sample_matches sm
    JOIN meta_collector_seeds s
      ON sm.raw->'metadata'->'participants' @> jsonb_build_array(to_jsonb(s.puuid))
    WHERE s.rank_tier IS NOT NULL
    ON CONFLICT DO NOTHING
    RETURNING match_id
  `) as unknown;

  const rows = Array.isArray(inserted)
    ? inserted
    : (inserted as { rows?: unknown[] }).rows ?? [];
  console.log(`Rank cohorts backfilled: ${rows.length} links added.`);
}

void runScript(main);
