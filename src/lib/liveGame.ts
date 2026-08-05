import { inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { matchParticipants } from '@/db/schema';
import { getRiotClient } from './riot/client';
import type { Platform } from './riot/routing';
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

export interface RoleFamiliarity {
  role: string;
  games: number;
  wins: number;
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
  /**
   * Role breakdown from matches gapdiff has already ingested — not just this
   * player's own games, but any match a tracked group member played that
   * this puuid also happened to be in (`storeMatch` scores the whole lobby,
   * tracked or not). Empty for anyone who's never crossed paths with the
   * group; there's no live Riot endpoint that gives this for an arbitrary
   * summoner without scraping their full history per page load.
   */
  roleHistory: RoleFamiliarity[];
  /**
   * Best-effort guess at this game's lane, not a fact Riot hands out — the
   * spectator feed carries no position data at all. Jungle is the one
   * near-certain case (nobody takes Smite unless they're jungling); the
   * other four come from a maximum-likelihood match against how often this
   * champion gets played in each role across every game gapdiff has
   * ingested. Null when the lobby isn't a clean 5-a-side (bots, customs) —
   * there's nothing to solve the assignment against.
   */
  laneRole: string | null;
  /** True when laneRole disagrees with this player's own most-played role
   *  and we have enough of their history (5+ games) to trust the comparison. */
  autofilled: boolean;
}

/** Left-to-right display order for a lane-based team. */
export const LANE_ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

/** Real per-champion role split across every match gapdiff has ingested —
 *  the population-level signal that stands in for porofessor's scraped
 *  whole-playerbase database, just scoped to what we actually have. */
async function getChampionRoleFrequency(): Promise<Map<number, Partial<Record<string, number>>>> {
  const rows = await db
    .select({
      championId: matchParticipants.championId,
      role: matchParticipants.role,
      games: sql<number>`count(*)::int`,
    })
    .from(matchParticipants)
    .groupBy(matchParticipants.championId, matchParticipants.role);

  const byChampion = new Map<number, Partial<Record<string, number>>>();
  for (const row of rows) {
    const entry = byChampion.get(row.championId) ?? {};
    entry[row.role] = row.games;
    byChampion.set(row.championId, entry);
  }
  return byChampion;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) result.push([items[i] as T, ...perm]);
  }
  return result;
}

/**
 * One team's worth of role guesses. Smite is pulled out first as a
 * near-certain signal; the remaining four champions are matched against
 * the four remaining roles by brute-force permutation (24 of them — cheap)
 * maximizing total log-likelihood against `freq`. Only assigns anything
 * when the group is exactly five players; a bot lobby or uneven custom
 * just gets left null rather than forced into a mismatched slot count.
 */
function assignLaneRoles(
  team: { puuid: string; championId: number; spell1Id: number; spell2Id: number }[],
  freq: Map<number, Partial<Record<string, number>>>,
): Map<string, string> {
  const assigned = new Map<string, string>();
  if (team.length !== 5) return assigned;

  const smiteHolders = team.filter((p) => p.spell1Id === 11 || p.spell2Id === 11);
  const jungler = smiteHolders.length === 1 ? smiteHolders[0] : undefined;
  if (jungler) assigned.set(jungler.puuid, 'JUNGLE');

  const remaining = team.filter((p) => p !== jungler);
  const rolesToFill = jungler ? LANE_ROLES.filter((r) => r !== 'JUNGLE') : [...LANE_ROLES];
  if (remaining.length !== rolesToFill.length) return assigned;

  const score = (championId: number, role: string) =>
    Math.log((freq.get(championId)?.[role] ?? 0) + 1);

  let best: string[] | null = null;
  let bestScore = -Infinity;
  for (const perm of permutations(rolesToFill)) {
    const total = remaining.reduce((sum, p, i) => sum + score(p.championId, perm[i] as string), 0);
    if (total > bestScore) {
      bestScore = total;
      best = perm;
    }
  }

  if (best) remaining.forEach((p, i) => assigned.set(p.puuid, best![i] as string));
  return assigned;
}

/** Highest-games-first role split, for every puuid gapdiff has ever scored a match for. */
async function getRoleFamiliarity(puuids: string[]): Promise<Map<string, RoleFamiliarity[]>> {
  if (puuids.length === 0) return new Map();

  const rows = await db
    .select({
      puuid: matchParticipants.puuid,
      role: matchParticipants.role,
      games: sql<number>`count(*)::int`,
      wins: sql<number>`sum(case when ${matchParticipants.win} then 1 else 0 end)::int`,
    })
    .from(matchParticipants)
    .where(inArray(matchParticipants.puuid, puuids))
    .groupBy(matchParticipants.puuid, matchParticipants.role);

  const byPuuid = new Map<string, RoleFamiliarity[]>();
  for (const row of rows) {
    const list = byPuuid.get(row.puuid) ?? [];
    list.push({ role: row.role, games: row.games, wins: row.wins });
    byPuuid.set(row.puuid, list);
  }
  for (const list of byPuuid.values()) list.sort((a, b) => b.games - a.games);
  return byPuuid;
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
  /**
   * Arena (`gameMode === 'CHERRY'`) puts every player on `teamId: 100` with
   * no pairing data anywhere in this endpoint, so there are no real "teams"
   * to render — the caller should lay these out as one flat grid instead of
   * the usual two-column Blue/Red split.
   */
  isTeamless: boolean;
  /** Whether `laneRole` was even attempted — only Summoner's Rift ("CLASSIC")
   *  has lanes; ARAM, Arena and the rest don't, so nothing is guessed there. */
  hasLaneRoles: boolean;
  participants: LiveGameParticipantView[];
  /** In pick-turn order, duplicates and all — two duos independently banning
   *  the same champion is real information, not noise to dedupe away. */
  bannedChampionIds: number[];
}

const TEAMLESS_MODES = new Set(['CHERRY']);

/**
 * Full detail for the live game page. `riotId` ("Name#TAG") already rides
 * along on every human participant in the spectator payload, so this only
 * needs one extra Riot call per player — their solo-queue rank.
 */
export async function getLiveGameView(platform: Platform, puuid: string): Promise<LiveGameView | null> {
  const riot = getRiotClient();
  const game = await riot.getActiveGame(platform, puuid);
  if (!game) return null;

  const roleHistoryByPuuid = await getRoleFamiliarity(
    game.participants.filter((p) => !p.bot).map((p) => p.puuid),
  );

  const participants: LiveGameParticipantView[] = await Promise.all(
    game.participants.map(async (p) => {
      const [gameName, tagLine] = p.riotId ? splitRiotId(p.riotId) : [null, null];

      if (p.bot) {
        return {
          puuid: p.puuid,
          teamId: p.teamId,
          championId: p.championId,
          spell1Id: p.spell1Id,
          spell2Id: p.spell2Id,
          profileIconId: p.profileIconId,
          bot: true,
          gameName,
          tagLine,
          soloRank: null,
          roleHistory: [],
          laneRole: null,
          autofilled: false,
        };
      }

      const leagues = await riot.getLeagueEntries(platform, p.puuid).catch(() => []);

      return {
        puuid: p.puuid,
        teamId: p.teamId,
        championId: p.championId,
        spell1Id: p.spell1Id,
        spell2Id: p.spell2Id,
        profileIconId: p.profileIconId,
        bot: false,
        gameName,
        tagLine,
        soloRank: leagues.find((l) => l.queueType === 'RANKED_SOLO_5x5') ?? null,
        roleHistory: roleHistoryByPuuid.get(p.puuid) ?? [],
        laneRole: null,
        autofilled: false,
      };
    }),
  );

  const hasLaneRoles = game.gameMode === 'CLASSIC';
  if (hasLaneRoles) {
    const freq = await getChampionRoleFrequency();
    for (const teamId of new Set(participants.map((p) => p.teamId))) {
      const team = participants.filter((p) => p.teamId === teamId);
      const roleByPuuid = assignLaneRoles(team, freq);
      for (const p of team) {
        const laneRole = roleByPuuid.get(p.puuid) ?? null;
        p.laneRole = laneRole;
        const mainRole = p.roleHistory[0];
        p.autofilled = Boolean(
          laneRole && mainRole && mainRole.games >= 5 && mainRole.role !== laneRole,
        );
      }
    }
  }

  return {
    gameId: game.gameId,
    platform,
    gameMode: game.gameMode,
    queueId: game.gameQueueConfigId,
    mapId: game.mapId,
    gameStartTime: game.gameStartTime,
    gameLength: game.gameLength,
    isTeamless: TEAMLESS_MODES.has(game.gameMode),
    hasLaneRoles,
    participants,
    bannedChampionIds: game.bannedChampions
      .filter((b) => b.championId !== -1)
      .sort((a, b) => a.pickTurn - b.pickTurn)
      .map((b) => b.championId),
  };
}

function splitRiotId(riotId: string): [string, string] {
  const hash = riotId.lastIndexOf('#');
  if (hash <= 0) return [riotId, ''];
  return [riotId.slice(0, hash), riotId.slice(hash + 1)];
}
