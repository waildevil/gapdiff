import { getRiotClient, RiotApiError } from './riot/client';
import { regionForPlatform, type Platform } from './riot/routing';
import { RATED_QUEUES, type LeagueEntry, type Match } from './riot/types';
import { scoreMatch } from './rating/score';
import { matchDurationSeconds } from './rating/metrics';
import { summariseTeammates, type Teammate } from './teammates';

/**
 * Everything the profile page needs, fetched live from Riot.
 *
 * No database involved: this is the op.gg-shaped path where a search resolves a
 * Riot ID and renders their real stats. Caching happens at the Next.js fetch
 * layer for now; once the friend-group leaderboard needs history over time,
 * ingestion writes to Postgres and pages read from there instead.
 *
 * The full lobby is kept on every match, because the API call already paid for
 * it — expanding a match into a scoreboard costs nothing extra.
 */

export const PAGE_SIZE = 10;

/**
 * Match-history tabs. Riot filters server-side by a single `queue` id, or by a
 * broader `type` — filtering a page client-side would be wrong, because the
 * ARAM tab would only ever show ARAM games that happened to land in the page
 * already fetched.
 */
export interface QueueFilter {
  id: string;
  label: string;
  queue?: number;
  type?: 'ranked' | 'normal';
  /** Narrows the result after fetching, when Riot's own filter is too broad. */
  includeQueues?: number[];
}

export const QUEUE_FILTERS: QueueFilter[] = [
  { id: 'all', label: 'All' },
  { id: 'solo', label: 'Ranked Solo', queue: 420 },
  { id: 'flex', label: 'Flex', queue: 440 },
  // Riot counts ARAM and Arena as "normal", which nobody expects from a tab
  // sitting next to an ARAM tab, so this keeps only Summoner's Rift queues.
  { id: 'normal', label: 'Normal', type: 'normal', includeQueues: [400, 430, 480, 490] },
  { id: 'aram', label: 'ARAM', queue: 450 },
  { id: 'arena', label: 'Arena', queue: 1700 },
];

export function queueFilter(id: string): QueueFilter {
  return QUEUE_FILTERS.find((f) => f.id === id) ?? QUEUE_FILTERS[0]!;
}

/** One row of the expanded scoreboard. */
export interface LobbyPlayer {
  puuid: string;
  gameName: string;
  tagLine: string;
  /** 0 when Riot omits it; callers fall back to generated art. */
  profileIconId: number;
  teamId: number;
  win: boolean;

  championName: string;
  championLevel: number;
  role: string;
  spell1: number;
  spell2: number;
  items: number[];
  trinket: number;

  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  killParticipation: number;

  damageDealt: number;
  damageTaken: number;
  cs: number;
  csPerMin: number;
  wardsPlaced: number;
  controlWards: number;
  visionScore: number;

  performanceScore: number | null;
  isSearchedPlayer: boolean;
}

export interface TeamSummary {
  teamId: number;
  win: boolean;
  kills: number;
  gold: number;
  towers: number;
  dragons: number;
  barons: number;
  heralds: number;
  inhibitors: number;
}

export interface ProfileMatch {
  matchId: string;
  championName: string;
  championLevel: number;
  role: string;
  win: boolean;
  /** True for remakes and early surrenders. */
  remake: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  killParticipation: number;
  cs: number;
  csPerMin: number;
  visionScore: number;
  spell1: number;
  spell2: number;
  items: number[];
  trinket: number;
  durationSeconds: number;
  playedAt: Date;
  queueId: number;
  performanceScore: number | null;
  /** All ten players, sorted blue team then red. */
  lobby: LobbyPlayer[];
  teams: TeamSummary[];
  /** Highest single damage figure in the lobby, for scaling the bars. */
  maxDamageDealt: number;
  maxDamageTaken: number;
}

export interface Profile {
  gameName: string;
  tagLine: string;
  platform: Platform;
  puuid: string;
  summonerLevel: number;
  profileIconId: number;
  solo: LeagueEntry | null;
  flex: LeagueEntry | null;
  matches: ProfileMatch[];
  /** False once Riot stops returning full pages. */
  hasMore: boolean;
  nextStart: number;
  /** Repeat team-mates across `matches`, best-known first. */
  teammates: Teammate[];
  recent: {
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    avgKda: number;
    avgCsPerMin: number;
    avgScore: number | null;
  };
}

export interface MatchPage {
  matches: ProfileMatch[];
  hasMore: boolean;
  /** Offset to pass for the next page, in Riot match-id terms. */
  nextStart: number;
}

export class ProfileNotFound extends Error {}

function buildMatch(match: Match, puuid: string): ProfileMatch | null {
  const me = match.info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;

  const duration = matchDurationSeconds(match);
  const minutes = Math.max(1, duration / 60);

  // Role weights assume Summoner's Rift lanes. ARAM has no roles, no meaningful
  // CS and no vision; Arena isn't even 5v5. Scoring those against SR weights
  // produces confident nonsense, so they stay unscored.
  const rated = RATED_QUEUES.includes(match.info.queueId);
  const scored = rated ? scoreMatch(match) : [];
  const scoreFor = (p: string) => scored.find((row) => row.puuid === p)?.score ?? null;
  const roleFor = (p: string) => scored.find((row) => row.puuid === p)?.role ?? '';

  const teamKills = new Map<number, number>();
  for (const p of match.info.participants) {
    teamKills.set(p.teamId, (teamKills.get(p.teamId) ?? 0) + p.kills);
  }

  const lobby: LobbyPlayer[] = match.info.participants
    .map((p) => {
      const cs = p.totalMinionsKilled + p.neutralMinionsKilled;
      const totalTeamKills = teamKills.get(p.teamId) ?? 0;
      return {
        puuid: p.puuid,
        gameName: p.riotIdGameName ?? 'Unknown',
        tagLine: p.riotIdTagline ?? '',
        profileIconId: p.profileIcon ?? 0,
        teamId: p.teamId,
        win: p.win,
        championName: p.championName,
        championLevel: p.champLevel,
        role: roleFor(p.puuid),
        spell1: p.summoner1Id,
        spell2: p.summoner2Id,
        items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5],
        trinket: p.item6,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        kda: p.deaths === 0 ? p.kills + p.assists : (p.kills + p.assists) / p.deaths,
        killParticipation:
          totalTeamKills > 0 ? (p.kills + p.assists) / totalTeamKills : 0,
        damageDealt: p.totalDamageDealtToChampions,
        damageTaken: p.totalDamageTaken,
        cs,
        csPerMin: cs / minutes,
        wardsPlaced: p.wardsPlaced,
        controlWards: p.visionWardsBoughtInGame,
        visionScore: p.visionScore,
        performanceScore: scoreFor(p.puuid),
        isSearchedPlayer: p.puuid === puuid,
      };
    })
    .sort((a, b) => a.teamId - b.teamId);

  const teams: TeamSummary[] = match.info.teams.map((team) => {
    const members = match.info.participants.filter((p) => p.teamId === team.teamId);
    return {
      teamId: team.teamId,
      win: team.win,
      kills: team.objectives.champion.kills,
      gold: members.reduce((sum, p) => sum + p.goldEarned, 0),
      towers: team.objectives.tower.kills,
      dragons: team.objectives.dragon.kills,
      barons: team.objectives.baron.kills,
      heralds: team.objectives.riftHerald.kills,
      inhibitors: team.objectives.inhibitor.kills,
    };
  });

  const myCs = me.totalMinionsKilled + me.neutralMinionsKilled;
  const myTeamKills = teamKills.get(me.teamId) ?? 0;

  return {
    matchId: match.metadata.matchId,
    championName: me.championName,
    championLevel: me.champLevel,
    role: rated ? roleFor(puuid) : '',
    win: me.win,
    remake: me.gameEndedInEarlySurrender || duration < 330,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    kda: me.deaths === 0 ? me.kills + me.assists : (me.kills + me.assists) / me.deaths,
    killParticipation: myTeamKills > 0 ? (me.kills + me.assists) / myTeamKills : 0,
    cs: myCs,
    csPerMin: myCs / minutes,
    visionScore: me.visionScore,
    spell1: me.summoner1Id,
    spell2: me.summoner2Id,
    items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5],
    trinket: me.item6,
    durationSeconds: duration,
    playedAt: new Date(match.info.gameStartTimestamp),
    queueId: match.info.queueId,
    performanceScore: scoreFor(puuid),
    lobby,
    teams,
    maxDamageDealt: Math.max(...lobby.map((p) => p.damageDealt), 1),
    maxDamageTaken: Math.max(...lobby.map((p) => p.damageTaken), 1),
  };
}

/** One page of match history. Used by the profile page, the tabs and "load more". */
export async function getMatches(
  platform: Platform,
  puuid: string,
  start = 0,
  count = PAGE_SIZE,
  filterId = 'all',
): Promise<MatchPage> {
  const riot = getRiotClient();
  const region = regionForPlatform(platform);
  const filter = queueFilter(filterId);

  const matchIds = await riot.getMatchIds(region, puuid, {
    start,
    count,
    ...(filter.queue ? { queue: filter.queue } : {}),
    ...(filter.type ? { type: filter.type } : {}),
  });
  if (matchIds.length === 0) return { matches: [], hasMore: false, nextStart: start };

  // The limiter serialises these internally, so firing them together is safe
  // and still respects the rate budget.
  const raw = await Promise.all(
    matchIds.map((id) => riot.getMatch(region, id).catch(() => null)),
  );

  let matches = raw
    .filter((match): match is Match => match !== null)
    .map((match) => buildMatch(match, puuid))
    .filter((match): match is ProfileMatch => match !== null);

  if (filter.includeQueues) {
    matches = matches.filter((m) => filter.includeQueues!.includes(m.queueId));
  }

  return {
    matches,
    hasMore: matchIds.length === count,
    // Paging must advance by ids consumed, not matches kept — narrowing a page
    // or a failed fetch would otherwise make "load more" re-request the same ids.
    nextStart: start + matchIds.length,
  };
}

export async function getProfile(
  platform: Platform,
  gameName: string,
  tagLine: string,
): Promise<Profile> {
  const riot = getRiotClient();
  const region = regionForPlatform(platform);

  let account;
  try {
    account = await riot.getAccountByRiotId(region, gameName, tagLine);
  } catch (error) {
    if (error instanceof RiotApiError && error.isNotFound) {
      throw new ProfileNotFound(`${gameName}#${tagLine} not found on ${platform}`);
    }
    throw error;
  }

  const summoner = await riot.getSummonerByPuuid(platform, account.puuid);
  const leagues = await riot.getLeagueEntries(platform, account.puuid, summoner.id);
  const { matches, hasMore, nextStart } = await getMatches(platform, account.puuid);

  const wins = matches.filter((m) => m.win).length;
  const withScore = matches.filter((m) => m.performanceScore !== null);
  const average = (values: number[]) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

  return {
    gameName: account.gameName,
    tagLine: account.tagLine,
    platform,
    puuid: account.puuid,
    summonerLevel: summoner.summonerLevel,
    profileIconId: summoner.profileIconId,
    solo: leagues.find((l) => l.queueType === 'RANKED_SOLO_5x5') ?? null,
    flex: leagues.find((l) => l.queueType === 'RANKED_FLEX_SR') ?? null,
    matches,
    hasMore,
    nextStart,
    teammates: summariseTeammates(matches, account.puuid),
    recent: {
      games: matches.length,
      wins,
      losses: matches.length - wins,
      winRate: matches.length ? Math.round((wins / matches.length) * 100) : 0,
      avgKda: average(matches.map((m) => m.kda)),
      avgCsPerMin: average(matches.map((m) => m.csPerMin)),
      avgScore: withScore.length
        ? average(withScore.map((m) => m.performanceScore!))
        : null,
    },
  };
}

export const QUEUE_NAMES: Record<number, string> = {
  0: 'Custom',
  400: 'Normal Draft',
  420: 'Ranked Solo',
  430: 'Normal Blind',
  440: 'Ranked Flex',
  450: 'ARAM',
  480: 'Swiftplay',
  490: 'Quickplay',
  700: 'Clash',
  720: 'ARAM Clash',
  900: 'ARURF',
  1020: 'One for All',
  1700: 'Arena',
  1710: 'Arena',
  1900: 'URF',
};

export function queueName(queueId: number): string {
  return QUEUE_NAMES[queueId] ?? `Queue ${queueId}`;
}

export function timeAgo(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
