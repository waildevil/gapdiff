import { and, desc, eq, gt, inArray, isNotNull, or } from 'drizzle-orm';
import { db } from '@/db';
import {
  accountClaims,
  accounts,
  activityEvents,
  friendships,
  groupMemberships,
  playerLiveState,
  trackedAccounts,
  users,
} from '@/db/schema';
import { getRiotClient } from './riot/client';
import type { Platform } from './riot/routing';
import type { CurrentGameInfo } from './riot/types';

/**
 * The live activity feed: what the viewer's friends and group-mates are doing
 * right now. There is no cron for this (see docs/DESIGN.md / CLAUDE.md) — a
 * poll from any viewer's open feed both reads and refreshes shared state, so
 * `player_live_state` doubles as a cache and `activity_events` as the log.
 * As long as *someone* with an overlapping friend/group circle has the feed
 * open, everyone who shares that circle sees transitions detected on their
 * behalf.
 */

/** Same ceiling as MAX_PLAYERS in src/app/api/live-status/route.ts. */
const MAX_SCOPE = 50;
/** Just under the 20s poll interval — a cache hit is the steady-state common case. */
const STALE_CHECK_MS = 18_000;
/** Stop calling someone "live now" if nobody has rechecked them in this long. */
const STALE_LIVE_MS = 8 * 60_000;

export interface ScopedAccount {
  puuid: string;
  platform: Platform;
  gameName: string;
  tagLine: string;
  profileIconId: number | null;
  ownerUserId: string | null;
  ownerName: string | null;
}

/**
 * Every account worth watching for a signed-in user: everyone tracked in any
 * group they belong to, plus every verified account of any accepted friend
 * (not `listFriends`' one-account-per-friend view — a friend's smurf matters
 * here). Deduped by puuid, capped defensively.
 */
export async function getActivityScope(userId: string): Promise<ScopedAccount[]> {
  const myGroups = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(eq(groupMemberships.userId, userId));
  const myGroupIds = myGroups.map((g) => g.groupId);

  const friendshipRows = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'accepted'),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    );
  const friendIds = friendshipRows.map((r) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId,
  );

  const accountColumns = {
    puuid: accounts.puuid,
    platform: accounts.platform,
    gameName: accounts.gameName,
    tagLine: accounts.tagLine,
    profileIconId: accounts.profileIconId,
    ownerUserId: accountClaims.userId,
    ownerName: users.name,
  };

  const [groupAccounts, friendAccounts] = await Promise.all([
    myGroupIds.length === 0
      ? Promise.resolve([])
      : db
          .select(accountColumns)
          .from(trackedAccounts)
          .innerJoin(accounts, eq(accounts.puuid, trackedAccounts.puuid))
          .leftJoin(
            accountClaims,
            and(eq(accountClaims.puuid, trackedAccounts.puuid), isNotNull(accountClaims.verifiedAt)),
          )
          .leftJoin(users, eq(users.id, accountClaims.userId))
          .where(inArray(trackedAccounts.groupId, myGroupIds)),
    friendIds.length === 0
      ? Promise.resolve([])
      : db
          .select(accountColumns)
          .from(accountClaims)
          .innerJoin(accounts, eq(accounts.puuid, accountClaims.puuid))
          .innerJoin(users, eq(users.id, accountClaims.userId))
          .where(and(inArray(accountClaims.userId, friendIds), isNotNull(accountClaims.verifiedAt))),
  ]);

  const merged = new Map<string, ScopedAccount>();
  for (const row of [...groupAccounts, ...friendAccounts]) {
    if (!merged.has(row.puuid)) {
      merged.set(row.puuid, { ...row, platform: row.platform as Platform });
    }
  }

  return [...merged.values()].slice(0, MAX_SCOPE);
}

export interface LiveGroup {
  gameId: string;
  queueId: number | null;
  startedAt: Date | null;
  /** One player = solo queue; two or more = playing together. */
  players: ScopedAccount[];
}

export interface ActivityEventView {
  id: number;
  kind: 'started' | 'finished';
  at: Date;
  queueId: number | null;
  account: ScopedAccount;
}

export interface ActivityFeed {
  liveNow: LiveGroup[];
  recentEvents: ActivityEventView[];
}

/**
 * Refreshes whichever of the viewer's scoped accounts haven't been checked
 * recently, then reads back the current feed. The refresh and the read are
 * one call on purpose — every viewer's poll both consumes and maintains the
 * shared state.
 */
export async function refreshAndListActivity(userId: string, limit = 30): Promise<ActivityFeed> {
  const scope = await getActivityScope(userId);
  if (scope.length === 0) return { liveNow: [], recentEvents: [] };

  const scopePuuids = scope.map((a) => a.puuid);
  const byPuuid = new Map(scope.map((a) => [a.puuid, a]));

  const existingRows = await db
    .select()
    .from(playerLiveState)
    .where(inArray(playerLiveState.puuid, scopePuuids));
  const existingByPuuid = new Map(existingRows.map((r) => [r.puuid, r]));

  const staleCheckCutoff = new Date(Date.now() - STALE_CHECK_MS);
  const needsCheck = scope.filter((a) => {
    const row = existingByPuuid.get(a.puuid);
    return !row || row.lastCheckedAt < staleCheckCutoff;
  });

  if (needsCheck.length > 0) {
    const riot = getRiotClient();
    const results = await Promise.allSettled(
      needsCheck.map(async (a) => ({
        puuid: a.puuid,
        game: await riot.getActiveGame(a.platform, a.puuid),
      })),
    );
    for (const result of results) {
      // A rejection here is a real Riot error (getActiveGame already resolves
      // "genuinely not in game" to null) — leave the row stale and retry next
      // poll rather than recording a false 'finished'.
      if (result.status === 'rejected') continue;
      await applyTransition(
        result.value.puuid,
        existingByPuuid.get(result.value.puuid) ?? null,
        result.value.game,
      );
    }
  }

  const staleLiveCutoff = new Date(Date.now() - STALE_LIVE_MS);
  const liveRows = await db
    .select()
    .from(playerLiveState)
    .where(
      and(
        inArray(playerLiveState.puuid, scopePuuids),
        eq(playerLiveState.live, true),
        gt(playerLiveState.lastCheckedAt, staleLiveCutoff),
      ),
    );

  const byGameId = new Map<string, typeof liveRows>();
  for (const row of liveRows) {
    if (!row.gameId) continue;
    const list = byGameId.get(row.gameId);
    if (list) list.push(row);
    else byGameId.set(row.gameId, [row]);
  }

  const liveNow: LiveGroup[] = [...byGameId.entries()]
    .map(([gameId, rows]) => ({
      gameId,
      queueId: rows[0]!.queueId,
      startedAt: rows[0]!.startedAt,
      players: rows.map((r) => byPuuid.get(r.puuid)).filter((p): p is ScopedAccount => p !== undefined),
    }))
    .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));

  const eventRows = await db
    .select()
    .from(activityEvents)
    .where(inArray(activityEvents.puuid, scopePuuids))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);

  const recentEvents: ActivityEventView[] = eventRows
    .map((row) => {
      const account = byPuuid.get(row.puuid);
      if (!account) return null;
      return {
        id: row.id,
        kind: row.kind as 'started' | 'finished',
        at: row.at,
        queueId: row.queueId,
        account,
      };
    })
    .filter((event): event is ActivityEventView => event !== null);

  return { liveNow, recentEvents };
}

type LiveStateRow = typeof playerLiveState.$inferSelect;

/** Diffs one player's fresh spectator result against their last known state,
 *  writing an activity_events row for any transition and upserting the
 *  current snapshot. */
async function applyTransition(
  puuid: string,
  previous: LiveStateRow | null,
  game: CurrentGameInfo | null,
): Promise<void> {
  const now = new Date();
  const wasLive = previous?.live ?? false;
  const previousGameId = previous?.gameId ?? null;

  if (!game) {
    if (wasLive) {
      await db.insert(activityEvents).values({
        puuid,
        kind: 'finished',
        gameId: previousGameId,
        queueId: previous?.queueId ?? null,
        at: now,
      });
    }
    await db
      .insert(playerLiveState)
      .values({ puuid, live: false, gameId: null, queueId: null, startedAt: null, lastCheckedAt: now })
      .onConflictDoUpdate({
        target: playerLiveState.puuid,
        set: { live: false, gameId: null, queueId: null, startedAt: null, lastCheckedAt: now },
      });
    return;
  }

  const gameId = String(game.gameId);

  if (wasLive && previousGameId === gameId) {
    // Still in the same game — nothing changed but the check time.
    await db.update(playerLiveState).set({ lastCheckedAt: now }).where(eq(playerLiveState.puuid, puuid));
    return;
  }

  if (wasLive && previousGameId) {
    // Finished and requeued between polls — both transitions happened.
    await db.insert(activityEvents).values({
      puuid,
      kind: 'finished',
      gameId: previousGameId,
      queueId: previous?.queueId ?? null,
      at: now,
    });
  }

  const startedAt = new Date(game.gameStartTime);
  await db.insert(activityEvents).values({
    puuid,
    kind: 'started',
    gameId,
    queueId: game.gameQueueConfigId,
    at: startedAt,
  });

  await db
    .insert(playerLiveState)
    .values({ puuid, live: true, gameId, queueId: game.gameQueueConfigId, startedAt, lastCheckedAt: now })
    .onConflictDoUpdate({
      target: playerLiveState.puuid,
      set: { live: true, gameId, queueId: game.gameQueueConfigId, startedAt, lastCheckedAt: now },
    });
}
