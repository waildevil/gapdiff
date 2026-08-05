import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { rankSnapshots } from '@/db/schema';
import { seasonStart } from './titles';

/**
 * Peak rank this season, from gapdiff's own snapshot history — Riot's
 * League-v4 endpoint only ever returns the *current* standing, so this is
 * only as deep as gapdiff has actually been capturing (snapshots began
 * 2026-07-31; nothing before that exists to look up). Null for anyone
 * gapdiff has never snapshotted, which includes every untracked account.
 */
export interface PeakRank {
  tier: string;
  division: string;
  leaguePoints: number;
}

export async function getPeakRank(puuid: string, queueType: string): Promise<PeakRank | null> {
  const [row] = await db
    .select({
      tier: rankSnapshots.tier,
      division: rankSnapshots.division,
      leaguePoints: rankSnapshots.leaguePoints,
    })
    .from(rankSnapshots)
    .where(
      and(
        eq(rankSnapshots.puuid, puuid),
        eq(rankSnapshots.queueType, queueType),
        gte(rankSnapshots.capturedAt, seasonStart()),
      ),
    )
    .orderBy(desc(rankSnapshots.rankPoints))
    .limit(1);
  return row ?? null;
}
