import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { searchHistory } from '@/db/schema';
import type { Platform } from '@/lib/riot/routing';

/** Records a profile view. Repeat views of the same player just bump the timestamp. */
export async function recordSearch(
  userId: string,
  player: { puuid: string; gameName: string; tagLine: string; platform: Platform },
): Promise<void> {
  await db
    .insert(searchHistory)
    .values({
      userId,
      puuid: player.puuid,
      gameName: player.gameName,
      tagLine: player.tagLine,
      platform: player.platform,
      searchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [searchHistory.userId, searchHistory.puuid],
      set: {
        gameName: player.gameName,
        tagLine: player.tagLine,
        platform: player.platform,
        searchedAt: new Date(),
      },
    });
}

export interface RecentSearch {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
}

/** Most recently viewed distinct players, newest first. Shown on the home page. */
export async function getRecentSearches(userId: string, limit = 3): Promise<RecentSearch[]> {
  return db
    .select({
      puuid: searchHistory.puuid,
      gameName: searchHistory.gameName,
      tagLine: searchHistory.tagLine,
      platform: searchHistory.platform,
    })
    .from(searchHistory)
    .where(eq(searchHistory.userId, userId))
    .orderBy(desc(searchHistory.searchedAt))
    .limit(limit);
}
