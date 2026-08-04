import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  accounts,
  duelParticipants,
  duels,
  groupMemberships,
  groups,
  rankSnapshots,
  trackedAccounts,
  users,
} from '@/db/schema';
import { formatRank, rankPoints } from './rating/rating';

/**
 * Duels: pick 2-4 people off a group's board and race their ranked LP for a
 * week. Standings are never stored — only the starting snapshot is — so the
 * page always compares "now" against "when this duel started", the same
 * derive-don't-store approach the group standings use for movement.
 */

export class DuelError extends Error {}

const MIN_RACERS = 2;
const MAX_RACERS = 4;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;

/** URL-safe, no ambiguous characters, short enough to paste in chat. */
function duelCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export interface DuelCandidate {
  puuid: string;
  gameName: string;
  tagLine: string;
  nickname: string | null;
}

/** Every account on a group's board — the pool a duel can be started from. */
export async function listDuelCandidates(groupId: number): Promise<DuelCandidate[]> {
  return db
    .select({
      puuid: accounts.puuid,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
      nickname: trackedAccounts.nickname,
    })
    .from(trackedAccounts)
    .innerJoin(accounts, eq(accounts.puuid, trackedAccounts.puuid))
    .where(eq(trackedAccounts.groupId, groupId));
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

export async function createDuel(
  groupId: number,
  userId: string,
  puuids: string[],
  days: number = DEFAULT_DAYS,
): Promise<{ code: string }> {
  const unique = [...new Set(puuids)];
  if (unique.length < MIN_RACERS) throw new DuelError(`Pick at least ${MIN_RACERS} people.`);
  if (unique.length > MAX_RACERS) throw new DuelError(`Pick at most ${MAX_RACERS} people.`);

  const [membership] = await db
    .select({ userId: groupMemberships.userId })
    .from(groupMemberships)
    .where(
      and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)),
    )
    .limit(1);
  if (!membership) throw new DuelError('You are not a member of that group.');

  const board = await listDuelCandidates(groupId);
  const boardPuuids = new Set(board.map((b) => b.puuid));
  for (const puuid of unique) {
    if (!boardPuuids.has(puuid)) {
      throw new DuelError("Everyone picked must be on this group's board.");
    }
  }

  const clampedDays = Math.min(MAX_DAYS, Math.max(1, Math.round(days)));
  const endAt = new Date(Date.now() + clampedDays * 24 * 60 * 60 * 1000);

  const [duel] = await db
    .insert(duels)
    .values({ code: duelCode(), groupId, createdBy: userId, endAt })
    .returning();
  if (!duel) throw new DuelError('Could not start the duel.');

  const ranks = await Promise.all(unique.map((puuid) => latestRank(puuid)));
  await db.insert(duelParticipants).values(
    unique.map((puuid, i) => ({
      duelId: duel.id,
      puuid,
      startTier: ranks[i]?.tier ?? null,
      startDivision: ranks[i]?.division ?? null,
      startLeaguePoints: ranks[i]?.leaguePoints ?? null,
    })),
  );

  return { code: duel.code };
}

export interface DuelRacer {
  puuid: string;
  gameName: string;
  tagLine: string;
  nickname: string | null;
  startRank: RankRow | null;
  currentRank: RankRow | null;
  /** Positive means climbed. Measured in rank points, from `rankPoints()`. */
  delta: number;
  formattedStart: string;
  formattedCurrent: string;
}

export interface DuelView {
  code: string;
  group: { slug: string; name: string };
  startAt: Date;
  endAt: Date;
  createdByName: string | null;
  ended: boolean;
  /** Sorted by delta, best climb first — this is the whole point of the page. */
  racers: DuelRacer[];
}

export async function getDuel(code: string): Promise<DuelView | null> {
  const [duel] = await db
    .select({
      id: duels.id,
      code: duels.code,
      groupId: duels.groupId,
      startAt: duels.startAt,
      endAt: duels.endAt,
      createdByName: users.name,
      groupSlug: groups.slug,
      groupName: groups.name,
    })
    .from(duels)
    .innerJoin(groups, eq(groups.id, duels.groupId))
    .leftJoin(users, eq(users.id, duels.createdBy))
    .where(eq(duels.code, code))
    .limit(1);
  if (!duel) return null;

  const participants = await db
    .select({
      puuid: duelParticipants.puuid,
      startTier: duelParticipants.startTier,
      startDivision: duelParticipants.startDivision,
      startLeaguePoints: duelParticipants.startLeaguePoints,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
    })
    .from(duelParticipants)
    .innerJoin(accounts, eq(accounts.puuid, duelParticipants.puuid))
    .where(eq(duelParticipants.duelId, duel.id));

  const puuids = participants.map((p) => p.puuid);

  const nicknameRows = puuids.length
    ? await db
        .select({ puuid: trackedAccounts.puuid, nickname: trackedAccounts.nickname })
        .from(trackedAccounts)
        .where(
          and(
            eq(trackedAccounts.groupId, duel.groupId),
            inArray(trackedAccounts.puuid, puuids),
          ),
        )
    : [];
  const nicknameByPuuid = new Map(nicknameRows.map((n) => [n.puuid, n.nickname]));

  const currentRanks = await Promise.all(puuids.map((puuid) => latestRank(puuid)));
  const currentByPuuid = new Map(puuids.map((puuid, i) => [puuid, currentRanks[i] ?? null]));

  const racers: DuelRacer[] = participants.map((p) => {
    const startRank: RankRow | null =
      p.startTier && p.startDivision && p.startLeaguePoints !== null
        ? { tier: p.startTier, division: p.startDivision, leaguePoints: p.startLeaguePoints }
        : null;
    const currentRank = currentByPuuid.get(p.puuid) ?? null;

    const startPoints = startRank
      ? rankPoints(startRank.tier, startRank.division, startRank.leaguePoints)
      : 0;
    const currentPoints = currentRank
      ? rankPoints(currentRank.tier, currentRank.division, currentRank.leaguePoints)
      : 0;

    return {
      puuid: p.puuid,
      gameName: p.gameName,
      tagLine: p.tagLine,
      nickname: nicknameByPuuid.get(p.puuid) ?? null,
      startRank,
      currentRank,
      delta: currentPoints - startPoints,
      formattedStart: startRank
        ? formatRank(startRank.tier, startRank.division, startRank.leaguePoints)
        : 'Unranked',
      formattedCurrent: currentRank
        ? formatRank(currentRank.tier, currentRank.division, currentRank.leaguePoints)
        : 'Unranked',
    };
  });

  racers.sort((a, b) => b.delta - a.delta);

  return {
    code: duel.code,
    group: { slug: duel.groupSlug, name: duel.groupName },
    startAt: duel.startAt,
    endAt: duel.endAt,
    createdByName: duel.createdByName,
    ended: duel.endAt.getTime() < Date.now(),
    racers,
  };
}
