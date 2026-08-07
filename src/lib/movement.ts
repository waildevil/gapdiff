import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import {
  accounts,
  groups,
  matchParticipants,
  matches,
  rankSnapshots,
  trackedAccounts,
} from '@/db/schema';
import { RANKED_QUEUES } from '@/lib/riot/types';
import { getGroupStandings } from './leaderboard';
import { DIVISIONS, rankPoints, TIERS, type Division, type Tier } from './rating/rating';

/**
 * What changed on a board, and when.
 *
 * A leaderboard that only ever shows a snapshot stops being worth opening: you
 * see who is first, and you saw that last week too. Movement is the part people
 * come back for, and it is also the only thing worth pushing to Discord —
 * nobody reads a daily repost of unchanged standings.
 *
 * Everything here is derived rather than stored. Matches are kept forever, so
 * a past board is reproduced exactly by recomputing it with a cutoff, and no
 * table of daily positions has to be maintained or backfilled.
 */

/** How far back "recently" means, unless a caller says otherwise. */
export const DEFAULT_WINDOW_DAYS = 7;

export interface PlayerMovement {
  puuid: string;
  gameName: string;
  /** Board position now, 1 = top. Null when unrated in the current board. */
  position: number | null;
  /** Position at the start of the window; null if they weren't rated then. */
  previousPosition: number | null;
  /** Positive means climbed. Null when either end is missing. */
  positionDelta: number | null;
  gapScore: number;
  gapScoreDelta: number | null;
  /** Ranked-solo LP movement across the window; null without two snapshots. */
  lpDelta: number | null;
  /** Games played inside the window. */
  games: number;
}

/** A single game worth mentioning by name. */
export interface NotableGame {
  gameName: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  win: boolean;
  soloKills: number;
  /** Rank within that lobby, 1 = best of the ten. */
  placement: number;
}

export interface Highlights {
  /** Best score in the window, if anybody actually played well. */
  best: NotableGame | null;
  /** Worst score, if anybody actually played badly. */
  worst: NotableGame | null;
  /** Top of the lobby and still lost — the most quotable outcome there is. */
  carried: NotableGame | null;
}

export interface TitleChange {
  titleId: string;
  label: string;
  holder: string;
  takenFrom: string;
}

/** A ranked-solo division or tier promotion, spotted between two snapshots. */
export interface RankUp {
  puuid: string;
  gameName: string;
  tier: string;
  division: string;
  fromTier: string;
  fromDivision: string;
}

/** A single game that beat this player's own all-time performance score. */
export interface PersonalBest {
  puuid: string;
  gameName: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  win: boolean;
  previousBest: number;
}

export interface GroupMovement {
  slug: string;
  groupName: string;
  /** The window that was asked for. */
  since: Date;
  /**
   * Where the positional comparison actually starts.
   *
   * Standings reset every month, so there is no such thing as a position in
   * this month's board before this month began. Asking for seven days on the
   * 2nd compares against the 1st, not against last month — the alternative is
   * measuring movement across a reset, which would report the whole board
   * jumping every time a month turns over. Early in a month this equals the
   * period start and every positionDelta is null; LP movement, which is
   * period-agnostic, carries the feature until the board has some depth.
   */
  comparedFrom: Date;
  players: PlayerMovement[];
  titleChanges: TitleChange[];
  /** Individual games worth talking about, which is what people actually read. */
  highlights: Highlights;
  /** Ranked-solo promotions inside the window. */
  rankUps: RankUp[];
  /** Games that broke a player's own all-time performance record. */
  personalBests: PersonalBest[];
}

/**
 * LP movement per player over a window, from the nightly rank snapshots.
 *
 * Needs two snapshots either side of the window to say anything, so this stays
 * null until the scheduled ingest has been running for a while. That is the
 * honest answer rather than reporting a change of zero.
 */
async function lpDeltas(puuids: string[], since: Date): Promise<Map<string, number>> {
  if (puuids.length === 0) return new Map();

  const rows = await db
    .select({
      puuid: rankSnapshots.puuid,
      tier: rankSnapshots.tier,
      division: rankSnapshots.division,
      leaguePoints: rankSnapshots.leaguePoints,
      capturedAt: rankSnapshots.capturedAt,
    })
    .from(rankSnapshots)
    .where(
      and(
        inArray(rankSnapshots.puuid, puuids),
        eq(rankSnapshots.queueType, 'RANKED_SOLO_5x5'),
      ),
    )
    .orderBy(desc(rankSnapshots.capturedAt));

  const newest = new Map<string, number>();
  const oldestInWindow = new Map<string, number>();
  const baseline = new Map<string, number>();

  // Newest first: the first hit per player is current, the last write before
  // the window is the baseline to measure against.
  for (const row of rows) {
    const points = rankPoints(row.tier, row.division, row.leaguePoints);
    if (!newest.has(row.puuid)) newest.set(row.puuid, points);
    if (row.capturedAt >= since) oldestInWindow.set(row.puuid, points);
    else if (!baseline.has(row.puuid)) baseline.set(row.puuid, points);
  }

  const deltas = new Map<string, number>();
  for (const [puuid, now] of newest) {
    // Prefer a snapshot from before the window; fall back to the earliest
    // inside it, which understates movement rather than inventing it.
    const then = baseline.get(puuid) ?? oldestInWindow.get(puuid);
    if (then === undefined || then === now) continue;
    deltas.set(puuid, now - then);
  }

  return deltas;
}

/**
 * Tier + division only, ignoring LP — coarser than {@link rankPoints}, on
 * purpose. Gaining LP inside the same division is already reported as the
 * daily LP delta; this is only for the rarer, more exciting event of
 * actually moving up a division or tier.
 */
function tierDivisionRank(tier: string, division: string): number {
  const tierIndex = TIERS.indexOf(tier.toUpperCase() as Tier);
  if (tierIndex < 0) return -1;
  if (tierIndex >= TIERS.indexOf('MASTER')) return tierIndex * DIVISIONS.length;
  const divisionIndex = DIVISIONS.indexOf(division.toUpperCase() as Division);
  return tierIndex * DIVISIONS.length + Math.max(0, divisionIndex);
}

/**
 * Ranked-solo promotions over a window, from the same snapshot history
 * {@link lpDeltas} reads. Needs a snapshot on either side to say anything, so
 * this stays quiet until the scheduled ingest has run at least twice.
 */
async function rankPromotions(
  puuids: string[],
  since: Date,
): Promise<Map<string, { tier: string; division: string; fromTier: string; fromDivision: string }>> {
  if (puuids.length === 0) return new Map();

  const rows = await db
    .select({
      puuid: rankSnapshots.puuid,
      tier: rankSnapshots.tier,
      division: rankSnapshots.division,
      capturedAt: rankSnapshots.capturedAt,
    })
    .from(rankSnapshots)
    .where(
      and(inArray(rankSnapshots.puuid, puuids), eq(rankSnapshots.queueType, 'RANKED_SOLO_5x5')),
    )
    .orderBy(desc(rankSnapshots.capturedAt));

  const newest = new Map<string, { tier: string; division: string }>();
  const oldestInWindow = new Map<string, { tier: string; division: string }>();
  const baseline = new Map<string, { tier: string; division: string }>();

  for (const row of rows) {
    const rank = { tier: row.tier, division: row.division };
    if (!newest.has(row.puuid)) newest.set(row.puuid, rank);
    if (row.capturedAt >= since) oldestInWindow.set(row.puuid, rank);
    else if (!baseline.has(row.puuid)) baseline.set(row.puuid, rank);
  }

  const promotions = new Map<
    string,
    { tier: string; division: string; fromTier: string; fromDivision: string }
  >();
  for (const [puuid, now] of newest) {
    const then = baseline.get(puuid) ?? oldestInWindow.get(puuid);
    if (!then) continue;
    if (tierDivisionRank(now.tier, now.division) > tierDivisionRank(then.tier, then.division)) {
      promotions.set(puuid, {
        tier: now.tier,
        division: now.division,
        fromTier: then.tier,
        fromDivision: then.division,
      });
    }
  }
  return promotions;
}

/**
 * Games inside the window that beat a player's own all-time performance
 * score. Players with no game before the window are skipped entirely — a
 * first-ever tracked game trivially "beats" nothing, and treating it as a
 * record would fire on every account added to the group.
 */
async function getPersonalBests(puuids: string[], since: Date): Promise<PersonalBest[]> {
  if (puuids.length === 0) return [];

  const priorBest = await db
    .select({
      puuid: matchParticipants.puuid,
      best: sql<number>`max(${matchParticipants.performanceScore})`,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.matchId, matchParticipants.matchId))
    .where(
      and(
        inArray(matchParticipants.puuid, puuids),
        eq(matches.scorable, true),
        inArray(matches.queueId, RANKED_QUEUES),
        lt(matches.gameCreation, since),
        isNotNull(matchParticipants.performanceScore),
      ),
    )
    .groupBy(matchParticipants.puuid);
  const priorBestByPuuid = new Map(priorBest.map((r) => [r.puuid, r.best]));

  const withHistory = puuids.filter((p) => priorBestByPuuid.has(p));
  if (withHistory.length === 0) return [];

  const windowRows = await db
    .select({
      puuid: matchParticipants.puuid,
      gameName: accounts.gameName,
      nickname: trackedAccounts.nickname,
      championName: matchParticipants.championName,
      kills: matchParticipants.kills,
      deaths: matchParticipants.deaths,
      assists: matchParticipants.assists,
      score: matchParticipants.performanceScore,
      win: matchParticipants.win,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.matchId, matchParticipants.matchId))
    .innerJoin(accounts, eq(accounts.puuid, matchParticipants.puuid))
    .innerJoin(trackedAccounts, eq(trackedAccounts.puuid, matchParticipants.puuid))
    .where(
      and(
        inArray(matchParticipants.puuid, withHistory),
        eq(matches.scorable, true),
        inArray(matches.queueId, RANKED_QUEUES),
        gte(matches.gameCreation, since),
        isNotNull(matchParticipants.performanceScore),
      ),
    )
    .orderBy(desc(matchParticipants.performanceScore));

  // Rows are ordered best-first, so the first hit per puuid is their best
  // game of the window — exactly the one worth comparing to their record.
  const seen = new Set<string>();
  const bests: PersonalBest[] = [];
  for (const row of windowRows) {
    if (seen.has(row.puuid)) continue;
    seen.add(row.puuid);

    const previousBest = priorBestByPuuid.get(row.puuid)!;
    if (row.score! <= previousBest) continue;

    bests.push({
      puuid: row.puuid,
      gameName: row.nickname ?? row.gameName,
      championName: row.championName,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      score: Math.round(row.score!),
      win: row.win,
      previousBest: Math.round(previousBest),
    });
  }
  return bests;
}

/**
 * A game only earns a mention if it was genuinely good or genuinely bad. The
 * best game of a mediocre evening is not news, and calling it out would make
 * the digest read like a participation award.
 */
const GOOD_ENOUGH = 70;
const BAD_ENOUGH = 30;

/**
 * The games worth naming.
 *
 * Placement comes from the same scored lobby the board uses, so "top of the
 * lobby and still lost" is a claim the match page will back up rather than a
 * separate opinion.
 */
async function getHighlights(puuids: string[], since: Date): Promise<Highlights> {
  const empty: Highlights = { best: null, worst: null, carried: null };
  if (puuids.length === 0) return empty;

  const mine = alias(matchParticipants, 'mine');
  const rows = await db
    .select({
      puuid: mine.puuid,
      gameName: accounts.gameName,
      nickname: trackedAccounts.nickname,
      matchId: mine.matchId,
      championName: mine.championName,
      kills: mine.kills,
      deaths: mine.deaths,
      assists: mine.assists,
      score: mine.performanceScore,
      win: mine.win,
      soloKills: mine.soloKills,
    })
    .from(mine)
    .innerJoin(matches, eq(matches.matchId, mine.matchId))
    .innerJoin(accounts, eq(accounts.puuid, mine.puuid))
    .innerJoin(trackedAccounts, eq(trackedAccounts.puuid, mine.puuid))
    .where(
      and(
        inArray(mine.puuid, puuids),
        eq(matches.scorable, true),
        inArray(matches.queueId, RANKED_QUEUES),
        gte(matches.gameCreation, since),
        isNotNull(mine.performanceScore),
      ),
    )
    .orderBy(desc(mine.performanceScore));

  if (rows.length === 0) return empty;

  // Placement needs the whole lobby, so it is fetched only for the handful of
  // matches that are actually going to be quoted.
  const candidates = [rows[0]!, rows[rows.length - 1]!, rows.find((r) => !r.win)].filter(
    (r): r is (typeof rows)[number] => r !== undefined,
  );

  const placements = new Map<string, number>();
  for (const row of candidates) {
    if (placements.has(`${row.matchId}|${row.puuid}`)) continue;
    const lobby = await db
      .select({ puuid: matchParticipants.puuid, score: matchParticipants.performanceScore })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, row.matchId))
      .orderBy(desc(matchParticipants.performanceScore));
    const index = lobby.findIndex((p) => p.puuid === row.puuid);
    if (index >= 0) placements.set(`${row.matchId}|${row.puuid}`, index + 1);
  }

  const toGame = (row: (typeof rows)[number]): NotableGame => ({
    gameName: row.nickname ?? row.gameName,
    championName: row.championName,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    score: Math.round(row.score!),
    win: row.win,
    soloKills: row.soloKills,
    placement: placements.get(`${row.matchId}|${row.puuid}`) ?? 0,
  });

  const top = rows[0]!;
  const bottom = rows[rows.length - 1]!;
  const bestLoss = rows.find((r) => !r.win);

  return {
    best: top.score! >= GOOD_ENOUGH ? toGame(top) : null,
    worst: bottom.score! <= BAD_ENOUGH ? toGame(bottom) : null,
    // Only interesting when it isn't already the best game of the window.
    carried:
      bestLoss && bestLoss.score! >= GOOD_ENOUGH && bestLoss.matchId !== top.matchId
        ? toGame(bestLoss)
        : null,
  };
}

export async function getGroupMovement(
  slug: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<GroupMovement | null> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const now = await getGroupStandings(slug);
  if (!now) return null;

  // Never reach back past the period boundary — see comparedFrom.
  const comparedFrom = since < now.period.start ? now.period.start : since;

  // The same computation again, truncated to the start of the window.
  const before = await getGroupStandings(slug, undefined, comparedFrom);

  const previousPosition = new Map<string, number>();
  const previousScore = new Map<string, number>();
  for (const entry of before?.entries ?? []) {
    if (!entry.rating.rated) continue;
    previousPosition.set(entry.player.puuid, entry.position);
    previousScore.set(entry.player.puuid, entry.rating.gapScore);
  }

  const memberPuuids = await db
    .select({ puuid: accounts.puuid })
    .from(trackedAccounts)
    .innerJoin(accounts, eq(accounts.puuid, trackedAccounts.puuid))
    .innerJoin(groups, eq(groups.id, trackedAccounts.groupId))
    .where(eq(groups.slug, slug));

  const puuidList = memberPuuids.map((m) => m.puuid);
  const [lp, highlights, promotions, personalBests] = await Promise.all([
    lpDeltas(puuidList, since),
    getHighlights(puuidList, since),
    rankPromotions(puuidList, since),
    getPersonalBests(puuidList, since),
  ]);

  const players: PlayerMovement[] = now.entries.map((entry) => {
    const wasAt = previousPosition.get(entry.player.puuid) ?? null;
    const isAt = entry.rating.rated ? entry.position : null;
    const wasScore = previousScore.get(entry.player.puuid) ?? null;

    return {
      puuid: entry.player.puuid,
      gameName: entry.player.nickname ?? entry.player.gameName,
      position: isAt,
      previousPosition: wasAt,
      // A smaller number is a better position, so the sign is flipped to make
      // positive mean "climbed" for anyone reading the value directly.
      positionDelta: isAt !== null && wasAt !== null ? wasAt - isAt : null,
      gapScore: entry.rating.gapScore,
      gapScoreDelta:
        wasScore !== null && entry.rating.rated
          ? Math.round((entry.rating.gapScore - wasScore) * 10) / 10
          : null,
      lpDelta: lp.get(entry.player.puuid) ?? null,
      games: entry.rating.games,
    };
  });

  /*
   * Titles already know who lost them — assignTitles works that out by
   * recomputing the previous month — so this reads what the board computed
   * rather than deriving it again.
   */
  const titleChanges: TitleChange[] = [];
  for (const board of now.boards) {
    for (const row of board.rows) {
      if (row.holdsTitle && row.takenFrom) {
        titleChanges.push({
          titleId: board.id,
          label: board.label,
          holder: row.gameName,
          takenFrom: row.takenFrom,
        });
      }
    }
  }

  const rankUps: RankUp[] = players
    .filter((p) => promotions.has(p.puuid))
    .map((p) => ({ puuid: p.puuid, gameName: p.gameName, ...promotions.get(p.puuid)! }));

  return {
    slug,
    groupName: now.group.name,
    since,
    comparedFrom,
    players,
    titleChanges,
    highlights,
    rankUps,
    personalBests,
  };
}

/** Anything worth telling the group about — used to decide whether to post. */
export function hasNews(movement: GroupMovement): boolean {
  return (
    movement.titleChanges.length > 0 ||
    movement.players.some(
      (p) => (p.positionDelta ?? 0) !== 0 || (p.lpDelta ?? 0) !== 0,
    ) ||
    movement.highlights.best !== null ||
    movement.highlights.worst !== null ||
    movement.rankUps.length > 0 ||
    movement.personalBests.length > 0
  );
}
