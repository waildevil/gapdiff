import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, groups, rankSnapshots, trackedAccounts } from '@/db/schema';
import { getGroupStandings } from './leaderboard';
import { rankPoints } from './rating/rating';

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

export interface TitleChange {
  titleId: string;
  label: string;
  holder: string;
  takenFrom: string;
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

  const lp = await lpDeltas(
    memberPuuids.map((m) => m.puuid),
    since,
  );

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

  return {
    slug,
    groupName: now.group.name,
    since,
    comparedFrom,
    players,
    titleChanges,
  };
}

/** Anything worth telling the group about — used to decide whether to post. */
export function hasNews(movement: GroupMovement): boolean {
  return (
    movement.titleChanges.length > 0 ||
    movement.players.some(
      (p) => (p.positionDelta ?? 0) !== 0 || (p.lpDelta ?? 0) !== 0,
    )
  );
}
