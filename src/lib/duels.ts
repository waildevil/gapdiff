import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, ne, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  accountClaims,
  accounts,
  duelParticipants,
  duels,
  groupMemberships,
  rankSnapshots,
  trackedAccounts,
  users,
} from '@/db/schema';
import { formatRank, rankPoints } from './rating/rating';

/**
 * Duels: challenge people to a ranked-LP race.
 *
 * You pick one of your own accounts, search for 1-3 people to challenge, and
 * they each accept or decline. Nothing about a racer's climb is shown until
 * they accept — a duel is a race two-plus people agreed to, not a scoreboard
 * one person can quietly build on somebody else. Standings are never stored,
 * only the starting snapshot is: the page always compares "now" against "when
 * this duel started", the same derive-don't-store approach group standings use
 * for movement.
 */

export class DuelError extends Error {}

const MIN_RACERS = 2;
const MAX_RACERS = 4;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const SEARCH_LIMIT = 8;

/** URL-safe, no ambiguous characters, short enough to paste in chat. */
function duelCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

type RankRow = { tier: string; division: string; leaguePoints: number };

async function latestRank(puuid: string): Promise<RankRow | null> {
  const [row] = await db
    .select({
      tier: rankSnapshots.tier,
      division: rankSnapshots.division,
      leaguePoints: rankSnapshots.leaguePoints,
    })
    .from(rankSnapshots)
    .where(
      and(eq(rankSnapshots.puuid, puuid), eq(rankSnapshots.queueType, 'RANKED_SOLO_5x5')),
    )
    .orderBy(desc(rankSnapshots.capturedAt))
    .limit(1);
  return row ?? null;
}

// --- who can be challenged --------------------------------------------------

export interface DuelTargetCandidate {
  puuid: string;
  gameName: string;
  tagLine: string;
  /** Shown so a search result reads "anvil — in The Boys" rather than a bare name. */
  groupName: string | null;
}

/**
 * People a user can challenge: anyone with a *verified* claim, since a
 * challenge has to reach a real inbox — an unverified assertion has nobody
 * reliable behind it to notify.
 *
 * With no query, this is limited to people who share a group with the
 * searcher, so the box starts out useful without them typing anything. A
 * query searches every verified account in the app, group or no group, so
 * "someone else" is always reachable by name.
 */
export async function searchDuelTargets(
  userId: string,
  query: string,
): Promise<DuelTargetCandidate[]> {
  const trimmed = query.trim();

  const myClaims = await db
    .select({ puuid: accountClaims.puuid })
    .from(accountClaims)
    .where(eq(accountClaims.userId, userId));
  const excluded = myClaims.map((c) => c.puuid);

  const myGroupIds = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(eq(groupMemberships.userId, userId));

  if (trimmed.length === 0) {
    if (myGroupIds.length === 0) return [];

    const rows = await db
      .selectDistinctOn([accounts.puuid], {
        puuid: accounts.puuid,
        gameName: accounts.gameName,
        tagLine: accounts.tagLine,
        groupName: sql<string>`(select name from groups where id = ${trackedAccounts.groupId})`,
      })
      .from(trackedAccounts)
      .innerJoin(accounts, eq(accounts.puuid, trackedAccounts.puuid))
      .innerJoin(
        accountClaims,
        and(eq(accountClaims.puuid, accounts.puuid), isNotNull(accountClaims.verifiedAt)),
      )
      .where(
        and(
          inArray(
            trackedAccounts.groupId,
            myGroupIds.map((g) => g.groupId),
          ),
          excluded.length > 0 ? notInArray(accounts.puuid, excluded) : undefined,
        ),
      )
      .limit(SEARCH_LIMIT);

    return rows;
  }

  const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);

  const rows = await db
    .selectDistinctOn([accounts.puuid], {
      puuid: accounts.puuid,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
      groupName: sql<string | null>`(
        select g.name from tracked_accounts ta
        join groups g on g.id = ta.group_id
        where ta.puuid = ${accounts.puuid}
        and ta.group_id in (select group_id from group_memberships where user_id = ${userId})
        limit 1
      )`,
    })
    .from(accounts)
    .innerJoin(
      accountClaims,
      and(eq(accountClaims.puuid, accounts.puuid), isNotNull(accountClaims.verifiedAt)),
    )
    .where(
      and(
        sql`${accounts.gameName} ilike ${escaped + '%'}`,
        excluded.length > 0 ? notInArray(accounts.puuid, excluded) : undefined,
      ),
    )
    .limit(SEARCH_LIMIT);

  return rows;
}

// --- creating a duel ---------------------------------------------------------

export async function createDuel(
  creatorUserId: string,
  creatorPuuid: string,
  targetPuuids: string[],
  days: number = DEFAULT_DAYS,
): Promise<{ code: string }> {
  const [creatorClaim] = await db
    .select({ puuid: accountClaims.puuid })
    .from(accountClaims)
    .where(
      and(eq(accountClaims.userId, creatorUserId), eq(accountClaims.puuid, creatorPuuid)),
    )
    .limit(1);
  if (!creatorClaim) throw new DuelError('Pick one of your own Riot accounts to race with.');

  const targets = [...new Set(targetPuuids)].filter((p) => p !== creatorPuuid);
  if (targets.length === 0) throw new DuelError('Challenge at least one person.');
  if (1 + targets.length > MAX_RACERS) {
    throw new DuelError(`Duels max out at ${MAX_RACERS} people.`);
  }

  const targetClaims = await db
    .select({
      puuid: accountClaims.puuid,
      userId: accountClaims.userId,
      gameName: accounts.gameName,
    })
    .from(accountClaims)
    .innerJoin(accounts, eq(accounts.puuid, accountClaims.puuid))
    .where(and(inArray(accountClaims.puuid, targets), isNotNull(accountClaims.verifiedAt)));

  const claimByPuuid = new Map(targetClaims.map((c) => [c.puuid, c]));
  for (const puuid of targets) {
    if (!claimByPuuid.has(puuid)) {
      throw new DuelError("That account hasn't been verified, so it can't be challenged.");
    }
  }

  const clampedDays = Math.min(MAX_DAYS, Math.max(1, Math.round(days)));
  const endAt = new Date(Date.now() + clampedDays * 24 * 60 * 60 * 1000);

  const [duel] = await db
    .insert(duels)
    .values({ code: duelCode(), createdBy: creatorUserId, endAt })
    .returning();
  if (!duel) throw new DuelError('Could not start the duel.');

  const allPuuids = [creatorPuuid, ...targets];
  const ranks = await Promise.all(allPuuids.map((puuid) => latestRank(puuid)));
  const now = new Date();

  await db.insert(duelParticipants).values(
    allPuuids.map((puuid, i) => {
      const isCreator = puuid === creatorPuuid;
      return {
        duelId: duel.id,
        puuid,
        invitedUserId: isCreator ? creatorUserId : claimByPuuid.get(puuid)!.userId,
        status: isCreator ? 'accepted' : 'pending',
        respondedAt: isCreator ? now : null,
        startTier: ranks[i]?.tier ?? null,
        startDivision: ranks[i]?.division ?? null,
        startLeaguePoints: ranks[i]?.leaguePoints ?? null,
      };
    }),
  );

  return { code: duel.code };
}

export async function respondToDuel(
  userId: string,
  duelId: number,
  puuid: string,
  accept: boolean,
): Promise<void> {
  const [row] = await db
    .select()
    .from(duelParticipants)
    .where(
      and(eq(duelParticipants.duelId, duelId), eq(duelParticipants.puuid, puuid)),
    )
    .limit(1);

  if (!row || row.invitedUserId !== userId) {
    throw new DuelError('That challenge is not addressed to you.');
  }
  if (row.status !== 'pending') throw new DuelError('You already responded to that challenge.');

  await db
    .update(duelParticipants)
    .set({ status: accept ? 'accepted' : 'declined', respondedAt: new Date() })
    .where(and(eq(duelParticipants.duelId, duelId), eq(duelParticipants.puuid, puuid)));
}

// --- viewing a duel -----------------------------------------------------------

export interface DuelRacer {
  puuid: string;
  gameName: string;
  tagLine: string;
  status: 'pending' | 'accepted' | 'declined';
  /** Only set once accepted — a pending racer's numbers stay hidden until they consent. */
  startRank: RankRow | null;
  currentRank: RankRow | null;
  delta: number | null;
  formattedStart: string | null;
  formattedCurrent: string | null;
  winner: boolean;
}

export interface DuelView {
  code: string;
  createdByName: string | null;
  startAt: Date;
  endAt: Date;
  ended: boolean;
  /** Set once the duel has been settled — final numbers are frozen, not live. */
  settled: boolean;
  /** Accepted racers, sorted by climb, best first. */
  racers: DuelRacer[];
  /** Everyone else — still deciding, or said no. */
  invited: DuelRacer[];
}

function toRankRow(
  tier: string | null,
  division: string | null,
  leaguePoints: number | null,
): RankRow | null {
  return tier && division && leaguePoints !== null ? { tier, division, leaguePoints } : null;
}

/**
 * Freezes the final standing for every accepted racer and records who won.
 *
 * Called at most once per duel, the first time anyone views it after `endAt`
 * has passed — there's no cron here, so settlement happens lazily on read
 * rather than on a schedule. A tie (or a duel nobody but the creator accepted)
 * settles with no winner rather than picking one arbitrarily.
 */
async function settleDuel(
  duelId: number,
  accepted: { puuid: string; startTier: string | null; startDivision: string | null; startLeaguePoints: number | null }[],
): Promise<{ endByPuuid: Map<string, RankRow | null>; winnerPuuid: string | null }> {
  const endRanks = await Promise.all(accepted.map((p) => latestRank(p.puuid)));
  const endByPuuid = new Map(accepted.map((p, i) => [p.puuid, endRanks[i] ?? null]));

  await Promise.all(
    accepted.map((p, i) => {
      const end = endRanks[i] ?? null;
      return db
        .update(duelParticipants)
        .set({
          endTier: end?.tier ?? null,
          endDivision: end?.division ?? null,
          endLeaguePoints: end?.leaguePoints ?? null,
        })
        .where(and(eq(duelParticipants.duelId, duelId), eq(duelParticipants.puuid, p.puuid)));
    }),
  );

  let winnerPuuid: string | null = null;
  if (accepted.length >= 2) {
    const ranked = accepted
      .map((p) => {
        const start = toRankRow(p.startTier, p.startDivision, p.startLeaguePoints);
        const end = endByPuuid.get(p.puuid) ?? null;
        const startPoints = start ? rankPoints(start.tier, start.division, start.leaguePoints) : 0;
        const endPoints = end ? rankPoints(end.tier, end.division, end.leaguePoints) : 0;
        return { puuid: p.puuid, delta: endPoints - startPoints };
      })
      .sort((a, b) => b.delta - a.delta);

    // A strict lead only — a tie for first means nobody won outright.
    if (ranked[0] && ranked[0].delta !== ranked[1]?.delta) {
      winnerPuuid = ranked[0].puuid;
    }
  }

  const now = new Date();
  await db.update(duels).set({ settledAt: now, winnerPuuid }).where(eq(duels.id, duelId));

  return { endByPuuid, winnerPuuid };
}

export async function getDuel(code: string): Promise<DuelView | null> {
  const [duel] = await db
    .select({
      id: duels.id,
      code: duels.code,
      startAt: duels.startAt,
      endAt: duels.endAt,
      settledAt: duels.settledAt,
      winnerPuuid: duels.winnerPuuid,
      createdByName: users.name,
    })
    .from(duels)
    .leftJoin(users, eq(users.id, duels.createdBy))
    .where(eq(duels.code, code))
    .limit(1);
  if (!duel) return null;

  const participants = await db
    .select({
      puuid: duelParticipants.puuid,
      status: duelParticipants.status,
      startTier: duelParticipants.startTier,
      startDivision: duelParticipants.startDivision,
      startLeaguePoints: duelParticipants.startLeaguePoints,
      endTier: duelParticipants.endTier,
      endDivision: duelParticipants.endDivision,
      endLeaguePoints: duelParticipants.endLeaguePoints,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
    })
    .from(duelParticipants)
    .innerJoin(accounts, eq(accounts.puuid, duelParticipants.puuid))
    .where(eq(duelParticipants.duelId, duel.id));

  const accepted = participants.filter((p) => p.status === 'accepted');
  const isPastEnd = duel.endAt.getTime() < Date.now();

  let settledAt = duel.settledAt;
  let winnerPuuid = duel.winnerPuuid;
  let liveEndByPuuid: Map<string, RankRow | null> | null = null;

  if (!settledAt && isPastEnd) {
    const settled = await settleDuel(duel.id, accepted);
    liveEndByPuuid = settled.endByPuuid;
    winnerPuuid = settled.winnerPuuid;
    settledAt = new Date();
  } else if (!settledAt) {
    // Still running: "current" is whatever the latest snapshot says right now.
    const live = await Promise.all(accepted.map((p) => latestRank(p.puuid)));
    liveEndByPuuid = new Map(accepted.map((p, i) => [p.puuid, live[i] ?? null]));
  }

  const racers: DuelRacer[] = [];
  const invited: DuelRacer[] = [];

  for (const p of participants) {
    const status = p.status as 'pending' | 'accepted' | 'declined';

    if (status !== 'accepted') {
      invited.push({
        puuid: p.puuid,
        gameName: p.gameName,
        tagLine: p.tagLine,
        status,
        startRank: null,
        currentRank: null,
        delta: null,
        formattedStart: null,
        formattedCurrent: null,
        winner: false,
      });
      continue;
    }

    const startRank = toRankRow(p.startTier, p.startDivision, p.startLeaguePoints);
    // Settled on a previous view: read the frozen columns. Settled just now,
    // or still running: read what settleDuel (or the live lookup) just fetched.
    const currentRank = liveEndByPuuid
      ? (liveEndByPuuid.get(p.puuid) ?? null)
      : toRankRow(p.endTier, p.endDivision, p.endLeaguePoints);

    const startPoints = startRank
      ? rankPoints(startRank.tier, startRank.division, startRank.leaguePoints)
      : 0;
    const currentPoints = currentRank
      ? rankPoints(currentRank.tier, currentRank.division, currentRank.leaguePoints)
      : 0;

    racers.push({
      puuid: p.puuid,
      gameName: p.gameName,
      tagLine: p.tagLine,
      status,
      startRank,
      currentRank,
      delta: currentPoints - startPoints,
      formattedStart: startRank
        ? formatRank(startRank.tier, startRank.division, startRank.leaguePoints)
        : 'Unranked',
      formattedCurrent: currentRank
        ? formatRank(currentRank.tier, currentRank.division, currentRank.leaguePoints)
        : 'Unranked',
      winner: p.puuid === winnerPuuid,
    });
  }

  racers.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));

  return {
    code: duel.code,
    createdByName: duel.createdByName,
    startAt: duel.startAt,
    endAt: duel.endAt,
    ended: isPastEnd,
    settled: settledAt !== null,
    racers,
    invited,
  };
}

// --- a user's own duels page --------------------------------------------------

export interface IncomingChallenge {
  duelId: number;
  code: string;
  puuid: string;
  gameName: string;
  tagLine: string;
  createdByName: string | null;
  /** Everyone else already in this duel, for "anvil challenged you and 2 others". */
  otherRacerNames: string[];
}

/** Challenges sent to this user that still need a yes or no. */
export async function listIncomingChallenges(userId: string): Promise<IncomingChallenge[]> {
  const rows = await db
    .select({
      duelId: duelParticipants.duelId,
      puuid: duelParticipants.puuid,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
      code: duels.code,
      createdByName: users.name,
    })
    .from(duelParticipants)
    .innerJoin(accounts, eq(accounts.puuid, duelParticipants.puuid))
    .innerJoin(duels, eq(duels.id, duelParticipants.duelId))
    .leftJoin(users, eq(users.id, duels.createdBy))
    .where(
      and(eq(duelParticipants.invitedUserId, userId), eq(duelParticipants.status, 'pending')),
    )
    .orderBy(desc(duels.createdAt));

  return Promise.all(
    rows.map(async (row) => {
      const others = await db
        .select({ gameName: accounts.gameName })
        .from(duelParticipants)
        .innerJoin(accounts, eq(accounts.puuid, duelParticipants.puuid))
        .where(
          and(eq(duelParticipants.duelId, row.duelId), ne(duelParticipants.puuid, row.puuid)),
        );
      return { ...row, otherRacerNames: others.map((o) => o.gameName) };
    }),
  );
}

export interface MyDuelRacer {
  gameName: string;
  delta: number | null;
  winner: boolean;
}

export interface MyDuel {
  code: string;
  endAt: Date;
  ended: boolean;
  /** Frozen final result once true — see `duels.settledAt`. */
  settled: boolean;
  racers: MyDuelRacer[];
}

/**
 * Duels this user is (or was) an accepted racer in, most recent first.
 *
 * Built on top of `getDuel`, which is also where settlement happens — so
 * opening this page is enough to freeze the result of any duel of yours that
 * has just ended, without a cron job anywhere.
 */
export async function listMyDuels(userId: string): Promise<MyDuel[]> {
  const mine = await db
    .select({ duelId: duelParticipants.duelId })
    .from(duelParticipants)
    .where(
      and(eq(duelParticipants.invitedUserId, userId), eq(duelParticipants.status, 'accepted')),
    );
  if (mine.length === 0) return [];

  const duelIds = [...new Set(mine.map((m) => m.duelId))];

  const rows = await db
    .select({ code: duels.code })
    .from(duels)
    .where(inArray(duels.id, duelIds))
    .orderBy(desc(duels.createdAt));

  const views = await Promise.all(rows.map((row) => getDuel(row.code)));

  return views
    .filter((view): view is DuelView => view !== null)
    .map((view) => ({
      code: view.code,
      endAt: view.endAt,
      ended: view.ended,
      settled: view.settled,
      racers: view.racers.map((r) => ({
        gameName: r.gameName,
        delta: r.delta,
        winner: r.winner,
      })),
    }));
}
