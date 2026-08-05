import { getRiotClient } from './riot/client';
import { regionForPlatform, type Platform } from './riot/routing';
import type { LeagueEntry } from './riot/types';

/**
 * Live-game lookups, in the same style as `getProfile`: called directly at
 * request time, never persisted (a spectator snapshot is stale the instant
 * it's read, so there's nothing worth storing).
 */

export interface LivePlayerRef {
  platform: Platform;
  puuid: string;
}

function statusKey(ref: LivePlayerRef): string {
  return `${ref.platform}:${ref.puuid}`;
}

/** One boolean per requested player, deduped so a repeated ref costs one call. */
export async function getLiveStatuses(players: LivePlayerRef[]): Promise<Map<string, boolean>> {
  const riot = getRiotClient();
  const unique = [...new Map(players.map((p) => [statusKey(p), p])).values()];

  const entries = await Promise.all(
    unique.map(async (p) => {
      const game = await riot.getActiveGame(p.platform, p.puuid).catch(() => null);
      return [statusKey(p), game !== null] as const;
    }),
  );

  return new Map(entries);
}

export interface LiveGameParticipantView {
  puuid: string;
  teamId: number;
  championId: number;
  spell1Id: number;
  spell2Id: number;
  profileIconId: number;
  bot: boolean;
  /** Null for bots — Riot doesn't hand out a Riot ID for them. */
  gameName: string | null;
  tagLine: string | null;
  soloRank: LeagueEntry | null;
}

export interface LiveGameTeam {
  teamId: number;
  bannedChampionIds: number[];
  participants: LiveGameParticipantView[];
}

export interface LiveGameView {
  gameId: number;
  platform: Platform;
  gameMode: string;
  queueId: number;
  mapId: number;
  gameStartTime: number;
  /** Seconds elapsed as of this fetch — the caller ticks it forward locally. */
  gameLength: number;
  teams: LiveGameTeam[];
}

/**
 * Full detail for the live game page: resolves every human participant's
 * Riot ID and solo-queue rank alongside the raw spectator payload. Bots are
 * left unresolved rather than sent through account/league lookups that would
 * always 404 for them.
 */
export async function getLiveGameView(platform: Platform, puuid: string): Promise<LiveGameView | null> {
  const riot = getRiotClient();
  const game = await riot.getActiveGame(platform, puuid);
  if (!game) return null;

  const region = regionForPlatform(platform);

  const participants: LiveGameParticipantView[] = await Promise.all(
    game.participants.map(async (p) => {
      if (p.bot) {
        return {
          puuid: p.puuid,
          teamId: p.teamId,
          championId: p.championId,
          spell1Id: p.spell1Id,
          spell2Id: p.spell2Id,
          profileIconId: p.profileIconId,
          bot: true,
          gameName: null,
          tagLine: null,
          soloRank: null,
        };
      }

      const [account, leagues] = await Promise.all([
        riot.getAccountByPuuid(region, p.puuid).catch(() => null),
        riot.getLeagueEntries(platform, p.puuid).catch(() => []),
      ]);

      return {
        puuid: p.puuid,
        teamId: p.teamId,
        championId: p.championId,
        spell1Id: p.spell1Id,
        spell2Id: p.spell2Id,
        profileIconId: p.profileIconId,
        bot: false,
        gameName: account?.gameName ?? null,
        tagLine: account?.tagLine ?? null,
        soloRank: leagues.find((l) => l.queueType === 'RANKED_SOLO_5x5') ?? null,
      };
    }),
  );

  const teamIds = [...new Set(game.participants.map((p) => p.teamId))].sort((a, b) => a - b);

  return {
    gameId: game.gameId,
    platform,
    gameMode: game.gameMode,
    queueId: game.gameQueueConfigId,
    mapId: game.mapId,
    gameStartTime: game.gameStartTime,
    gameLength: game.gameLength,
    teams: teamIds.map((teamId) => ({
      teamId,
      bannedChampionIds: game.bannedChampions
        .filter((b) => b.teamId === teamId)
        .map((b) => b.championId),
      participants: participants.filter((p) => p.teamId === teamId),
    })),
  };
}
