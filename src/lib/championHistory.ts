import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { matchParticipants, matches } from '@/db/schema';
import type { ChampionQueueRow } from './champions';
import { seasonStart } from './titles';

/**
 * Champion history from the database, for accounts the ingester tracks.
 *
 * The live profile only fetches ten matches, which is not a champion pool — it
 * is a handful of "100% over 1 game" rows. Tracked accounts already have their
 * whole season in `match_participants`, so this costs no Riot calls and gives
 * the sidebar the depth op.gg has. Untracked players get an empty array and the
 * caller falls back to those ten live matches.
 *
 * Kept apart from `champions.ts` because the sidebar is a client component:
 * anything it imports is bundled for the browser, and the database driver
 * reaches for `node:path`.
 */
export async function getChampionHistory(puuid: string): Promise<ChampionQueueRow[]> {
  const rows = await db
    .select({
      championName: matchParticipants.championName,
      queueId: matches.queueId,
      win: matchParticipants.win,
      kills: matchParticipants.kills,
      deaths: matchParticipants.deaths,
      assists: matchParticipants.assists,
      csPerMin: matchParticipants.csPerMin,
      visionScore: matchParticipants.visionScore,
      score: matchParticipants.performanceScore,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.matchId, matchParticipants.matchId))
    .where(
      and(eq(matchParticipants.puuid, puuid), gte(matches.gameCreation, seasonStart())),
    );

  const byKey = new Map<string, ChampionQueueRow>();

  for (const row of rows) {
    const key = `${row.championName}|${row.queueId}`;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        championName: row.championName,
        queueId: row.queueId,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        csPerMinTotal: 0,
        visionTotal: 0,
        scoreTotal: 0,
        scoredGames: 0,
      };
      byKey.set(key, bucket);
    }

    bucket.games += 1;
    if (row.win) bucket.wins += 1;
    bucket.kills += row.kills;
    bucket.deaths += row.deaths;
    bucket.assists += row.assists;
    bucket.csPerMinTotal += row.csPerMin;
    bucket.visionTotal += row.visionScore;
    if (row.score !== null) {
      bucket.scoreTotal += row.score;
      bucket.scoredGames += 1;
    }
  }

  return [...byKey.values()];
}
