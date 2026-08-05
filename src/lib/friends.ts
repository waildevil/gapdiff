import { and, desc, eq, inArray, isNotNull, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { accountClaims, accounts, blocks, friendships, groupMemberships, users } from '@/db/schema';

/**
 * Friends and blocking.
 *
 * A friendship is one row, directional until accepted — `requesterId` asked,
 * `addresseeId` answers. Blocking is separate and one-directional to record
 * ("who blocked whom"), but `isBlocked` checks both directions: once either
 * side has blocked the other, every interaction this app offers — friend
 * requests, duel challenges, messages — stops for both of them.
 */

export class FriendError extends Error {}

const SEARCH_LIMIT = 8;

export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const [row] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'accepted'),
        or(
          and(eq(friendships.requesterId, userA), eq(friendships.addresseeId, userB)),
          and(eq(friendships.requesterId, userB), eq(friendships.addresseeId, userA)),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Every user id blocked either direction — for filtering search results. */
export async function listBlockedUserIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  return rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId));
}

export async function isBlocked(userA: string, userB: string): Promise<boolean> {
  const [row] = await db
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, userA), eq(blocks.blockedId, userB)),
        and(eq(blocks.blockerId, userB), eq(blocks.blockedId, userA)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type RelationshipStatus = 'self' | 'friends' | 'pending' | 'blocked' | 'none';

/**
 * One status per candidate user id, for a page showing several people at
 * once (the group standings) that needs to know per-row whether "Add
 * friend" even makes sense — without a query per row.
 */
export async function getRelationshipStatuses(
  viewerId: string,
  otherUserIds: string[],
): Promise<Map<string, RelationshipStatus>> {
  const ids = [...new Set(otherUserIds)].filter((id) => id !== viewerId);
  const result = new Map<string, RelationshipStatus>();
  for (const id of otherUserIds) result.set(id, id === viewerId ? 'self' : 'none');
  if (ids.length === 0) return result;

  const [friendshipRows, blockRows] = await Promise.all([
    db
      .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId, status: friendships.status })
      .from(friendships)
      .where(
        and(
          or(eq(friendships.requesterId, viewerId), eq(friendships.addresseeId, viewerId)),
          or(inArray(friendships.requesterId, ids), inArray(friendships.addresseeId, ids)),
        ),
      ),
    db
      .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
      .from(blocks)
      .where(
        and(
          or(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, viewerId)),
          or(inArray(blocks.blockerId, ids), inArray(blocks.blockedId, ids)),
        ),
      ),
  ]);

  for (const row of friendshipRows) {
    const otherId = row.requesterId === viewerId ? row.addresseeId : row.requesterId;
    if (row.status === 'accepted') result.set(otherId, 'friends');
    else if (row.status === 'pending' && result.get(otherId) !== 'friends') {
      result.set(otherId, 'pending');
    }
  }
  for (const row of blockRows) {
    const otherId = row.blockerId === viewerId ? row.blockedId : row.blockerId;
    result.set(otherId, 'blocked');
  }

  return result;
}

// --- finding people to add --------------------------------------------------

export interface FriendCandidate {
  userId: string;
  /** The Riot ID people actually recognize each other by — friending, like
   *  dueling, is found and typed by summoner name, not Discord display name. */
  gameName: string;
  tagLine: string;
  groupName: string | null;
}

/**
 * People a user could send a friend request to: not themselves, not already
 * friends or pending either direction, not blocked either direction. Matched
 * by *verified* Riot ID — same identity search as duel challenges, so
 * there's exactly one way to look somebody up anywhere in this app.
 *
 * With no query, limited to people who share a group, so the box starts out
 * useful. A query reaches anyone verified in the app by Riot ID.
 */
export async function searchFriendCandidates(
  userId: string,
  query: string,
): Promise<FriendCandidate[]> {
  const trimmed = query.trim();

  const existing = await db
    .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
    .from(friendships)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));
  const blockedRows = await db
    .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));

  const excluded = new Set<string>([userId]);
  for (const row of existing) {
    excluded.add(row.requesterId === userId ? row.addresseeId : row.requesterId);
  }
  for (const row of blockedRows) {
    excluded.add(row.blockerId === userId ? row.blockedId : row.blockerId);
  }
  const excludedList = [...excluded];

  if (trimmed.length === 0) {
    const myGroups = await db
      .select({ groupId: groupMemberships.groupId })
      .from(groupMemberships)
      .where(eq(groupMemberships.userId, userId));
    if (myGroups.length === 0) return [];

    const rows = await db
      .selectDistinctOn([accountClaims.userId], {
        userId: accountClaims.userId,
        gameName: accounts.gameName,
        tagLine: accounts.tagLine,
        groupName: sql<string>`(select name from groups where id = ${groupMemberships.groupId})`,
      })
      .from(groupMemberships)
      .innerJoin(
        accountClaims,
        and(
          eq(accountClaims.userId, groupMemberships.userId),
          isNotNull(accountClaims.verifiedAt),
        ),
      )
      .innerJoin(accounts, eq(accounts.puuid, accountClaims.puuid))
      .where(
        and(
          inArray(
            groupMemberships.groupId,
            myGroups.map((g) => g.groupId),
          ),
          notInArray(accountClaims.userId, excludedList),
        ),
      )
      .limit(SEARCH_LIMIT);

    return rows;
  }

  const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);

  const rows = await db
    .selectDistinctOn([accountClaims.userId], {
      userId: accountClaims.userId,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
      groupName: sql<string | null>`(
        select g.name from group_memberships gm
        join groups g on g.id = gm.group_id
        where gm.user_id = ${accountClaims.userId}
        and gm.group_id in (select group_id from group_memberships where user_id = ${userId})
        limit 1
      )`,
    })
    .from(accountClaims)
    .innerJoin(accounts, eq(accounts.puuid, accountClaims.puuid))
    .where(
      and(
        isNotNull(accountClaims.verifiedAt),
        sql`${accounts.gameName} ilike ${escaped + '%'}`,
        notInArray(accountClaims.userId, excludedList),
      ),
    )
    .limit(SEARCH_LIMIT);

  return rows;
}

// --- requests ----------------------------------------------------------------

export interface FriendRequestView {
  id: number;
  userId: string;
  name: string | null;
  image: string | null;
}

/**
 * Sends a request, or — if the other person already asked first — accepts
 * theirs instead. Two people wanting the same thing shouldn't need to notice
 * they're crossing in the mail.
 */
export async function sendFriendRequest(userId: string, targetUserId: string): Promise<void> {
  if (userId === targetUserId) throw new FriendError("You can't friend yourself.");
  if (await isBlocked(userId, targetUserId)) {
    throw new FriendError("You can't send a request to this person.");
  }

  const [existing] = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, targetUserId)),
        and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, userId)),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.status === 'accepted') throw new FriendError('You are already friends.');
    if (existing.status === 'pending' && existing.requesterId === userId) {
      throw new FriendError('Request already sent.');
    }
    if (existing.status === 'pending' && existing.requesterId === targetUserId) {
      await db
        .update(friendships)
        .set({ status: 'accepted', respondedAt: new Date() })
        .where(eq(friendships.id, existing.id));
      return;
    }
    // Declined previously — let them try again with a clean row.
    await db.delete(friendships).where(eq(friendships.id, existing.id));
  }

  await db.insert(friendships).values({ requesterId: userId, addresseeId: targetUserId });
}

export async function respondToFriendRequest(
  userId: string,
  requestId: number,
  accept: boolean,
): Promise<void> {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId)).limit(1);
  if (!row || row.addresseeId !== userId) {
    throw new FriendError('That request is not addressed to you.');
  }
  if (row.status !== 'pending') throw new FriendError('You already responded to that request.');

  await db
    .update(friendships)
    .set({ status: accept ? 'accepted' : 'declined', respondedAt: new Date() })
    .where(eq(friendships.id, requestId));
}

export async function removeFriend(userId: string, friendUserId: string): Promise<void> {
  await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.status, 'accepted'),
        or(
          and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, friendUserId)),
          and(eq(friendships.requesterId, friendUserId), eq(friendships.addresseeId, userId)),
        ),
      ),
    );
}

/** Requests sent to this user that still need a yes or no. */
export async function listIncomingFriendRequests(userId: string): Promise<FriendRequestView[]> {
  return db
    .select({
      id: friendships.id,
      userId: friendships.requesterId,
      name: users.name,
      image: users.image,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'pending')))
    .orderBy(desc(friendships.createdAt));
}

/** Requests this user sent that are still waiting on someone else. */
export async function listOutgoingFriendRequests(userId: string): Promise<FriendRequestView[]> {
  return db
    .select({
      id: friendships.id,
      userId: friendships.addresseeId,
      name: users.name,
      image: users.image,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.addresseeId))
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'pending')))
    .orderBy(desc(friendships.createdAt));
}

/** Withdraws a request before the other person has answered it. */
export async function cancelFriendRequest(userId: string, requestId: number): Promise<void> {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId)).limit(1);
  if (!row || row.requesterId !== userId) throw new FriendError('That request is not yours.');
  if (row.status !== 'pending') throw new FriendError('That request has already been answered.');
  await db.delete(friendships).where(eq(friendships.id, requestId));
}

export interface FriendView {
  userId: string;
  name: string | null;
  image: string | null;
  /** From their first verified Riot account, if they have one — the account
   *  the live-game dot and profile link point at. Null for someone who hasn't
   *  verified a Riot ID yet. */
  puuid: string | null;
  platform: string | null;
  gameName: string | null;
  tagLine: string | null;
}

export async function listFriends(userId: string): Promise<FriendView[]> {
  const rows = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'accepted'),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    );
  if (rows.length === 0) return [];

  const friendIds = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));

  const [friendUsers, verifiedAccounts] = await Promise.all([
    db
      .select({ userId: users.id, name: users.name, image: users.image })
      .from(users)
      .where(inArray(users.id, friendIds)),
    db
      .selectDistinctOn([accountClaims.userId], {
        userId: accountClaims.userId,
        puuid: accounts.puuid,
        platform: accounts.platform,
        gameName: accounts.gameName,
        tagLine: accounts.tagLine,
      })
      .from(accountClaims)
      .innerJoin(accounts, eq(accounts.puuid, accountClaims.puuid))
      .where(and(inArray(accountClaims.userId, friendIds), isNotNull(accountClaims.verifiedAt)))
      .orderBy(accountClaims.userId, accountClaims.createdAt),
  ]);

  const accountByUser = new Map(verifiedAccounts.map((a) => [a.userId, a]));

  return friendUsers.map((friend) => {
    const account = accountByUser.get(friend.userId);
    return {
      ...friend,
      puuid: account?.puuid ?? null,
      platform: account?.platform ?? null,
      gameName: account?.gameName ?? null,
      tagLine: account?.tagLine ?? null,
    };
  });
}

export async function countIncomingFriendRequests(userId: string): Promise<number> {
  const rows = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'pending')));
  return rows.length;
}

// --- blocking ------------------------------------------------------------

/** Blocking also removes any friendship, and cancels a pending request either way. */
export async function blockUser(userId: string, targetUserId: string): Promise<void> {
  if (userId === targetUserId) throw new FriendError("You can't block yourself.");

  await db.insert(blocks).values({ blockerId: userId, blockedId: targetUserId }).onConflictDoNothing();

  await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, targetUserId)),
        and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, userId)),
      ),
    );
}

export async function unblockUser(userId: string, targetUserId: string): Promise<void> {
  await db
    .delete(blocks)
    .where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, targetUserId)));
}

export interface BlockedView {
  userId: string;
  name: string | null;
  image: string | null;
}

export async function listBlocked(userId: string): Promise<BlockedView[]> {
  return db
    .select({ userId: users.id, name: users.name, image: users.image })
    .from(blocks)
    .innerJoin(users, eq(users.id, blocks.blockedId))
    .where(eq(blocks.blockerId, userId));
}
