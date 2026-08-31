'use server';

import { getMatches, type MatchPage } from '@/lib/profile';
import { isPlatform } from '@/lib/riot/routing';
import { riotProblem } from '@/lib/riot/problem';

/**
 * Backs both the queue tabs (start = 0) and the "Load more" button.
 *
 * The Riot key never reaches the browser — the client calls this, it runs on the
 * server, and only the finished match objects cross the wire.
 */
export async function fetchMatches(
  platform: string,
  puuid: string,
  start: number,
  filterId: string,
): Promise<MatchPage & { error?: string }> {
  if (!isPlatform(platform)) {
    return { matches: [], hasMore: false, nextStart: start, error: 'Unknown region.' };
  }

  try {
    return await getMatches(platform, puuid, start, undefined, filterId);
  } catch (error) {
    const problem = riotProblem(error);
    return {
      matches: [],
      hasMore: true,
      nextStart: start,
      error: problem ? [problem.body, problem.hint].filter(Boolean).join(' ') : 'Could not load games.',
    };
  }
}
