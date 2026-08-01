import { winRate } from './format';
import type { ProfileMatch } from './profile';

/**
 * Players who keep turning up on your side of the draw.
 *
 * Every match already carries its full lobby, so this panel costs nothing
 * beyond the profile fetch that was happening anyway — no extra Riot calls.
 */

export interface Teammate {
  puuid: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

/**
 * One shared game is a coincidence in solo queue. Without this floor the duo
 * partner you care about sits buried under nine strangers from last night.
 */
export const MIN_GAMES_TOGETHER = 2;

/**
 * Arena splits a single teamId across four subteams, so "same team" there means
 * three people you were actively fighting.
 */
const TEAMLESS_QUEUES = [1700, 1710];

export function summariseTeammates(
  matches: ProfileMatch[],
  puuid: string,
  limit = 8,
): Teammate[] {
  const tally = new Map<string, Teammate>();

  for (const match of matches) {
    // Remakes say nothing about a pairing and would drag the shared win rate
    // down — the same reason they score nothing anywhere else in the app.
    if (match.remake) continue;
    if (TEAMLESS_QUEUES.includes(match.queueId)) continue;

    const me = match.lobby.find((p) => p.puuid === puuid);
    if (!me) continue;

    for (const player of match.lobby) {
      if (player.puuid === puuid) continue;
      if (player.teamId !== me.teamId) continue;
      // Riot drops the Riot ID on some older matches, leaving nothing to label
      // the row with or link to.
      if (player.gameName === 'Unknown' || !player.tagLine) continue;

      const seen = tally.get(player.puuid);
      if (seen) {
        seen.games += 1;
        if (me.win) seen.wins += 1;
        else seen.losses += 1;
        // Riot IDs and icons change. Matches arrive newest-first, so what is
        // already stored came from the more recent game and stays.
      } else {
        tally.set(player.puuid, {
          puuid: player.puuid,
          gameName: player.gameName,
          tagLine: player.tagLine,
          profileIconId: player.profileIconId,
          games: 1,
          wins: me.win ? 1 : 0,
          losses: me.win ? 0 : 1,
          winRate: 0,
        });
      }
    }
  }

  return [...tally.values()]
    .filter((t) => t.games >= MIN_GAMES_TOGETHER)
    .map((t) => ({ ...t, winRate: winRate(t.wins, t.losses) }))
    .sort(
      (a, b) =>
        b.games - a.games ||
        b.winRate - a.winRate ||
        a.gameName.localeCompare(b.gameName),
    )
    .slice(0, limit);
}
