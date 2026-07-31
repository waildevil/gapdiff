import 'dotenv/config';
import { asc, sql } from 'drizzle-orm';
import { db, runScript } from '@/db';
import { matches } from '@/db/schema';
import { indexMatchParticipants, indexSize } from '@/lib/playerIndex';
import type { Match } from '@/lib/riot/types';

/**
 * Builds the player search index from matches already in the database.
 *
 * Costs nothing: the raw payload of every match is stored, so every
 * participant's Riot ID is already on disk. No Riot API calls at all.
 *
 *   npm run build-index
 */
const BATCH = 200;

async function main() {
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(matches);
  const matchCount = total?.n ?? 0;
  console.log(`Indexing participants from ${matchCount} stored matches\n`);

  const before = await indexSize();
  let processed = 0;
  let recorded = 0;

  for (let offset = 0; offset < matchCount; offset += BATCH) {
    const batch = await db
      .select({ matchId: matches.matchId, raw: matches.raw })
      .from(matches)
      .orderBy(asc(matches.matchId))
      .limit(BATCH)
      .offset(offset);

    if (batch.length === 0) break;

    for (const row of batch) {
      // Riot changes payload shapes between patches; a malformed row shouldn't
      // abort a backfill of several hundred matches.
      try {
        recorded += await indexMatchParticipants(row.raw as Match);
      } catch (error) {
        console.error(`  skipped ${row.matchId}: ${(error as Error).message}`);
      }
      processed++;
    }

    console.log(`  ${processed}/${matchCount} matches`);
  }

  const after = await indexSize();
  console.log(
    `\nDone. ${recorded} sightings recorded, ${after - before} new players ` +
      `(index now holds ${after}).`,
  );
}

void runScript(main);
