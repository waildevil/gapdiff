import { and, desc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { blocks, friendships, groupMemberships, users } from '@/db/schema';

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

// --- finding people to add --------------------------------------------------

export interface FriendCandidate {
  userId: string;
  name: string | null;
  image: string | null;
  groupName: string | null;
}

/**
 * People a user could send a friend request to: not themselves, not already
 * friends or pending either direction, not blocked either direction.
 *
 * With no query, limited to people who share a group — same shape as
 * `searchDuelTargets`, so the box starts out useful. A query reaches anyone
 * in the app by Discord display name.
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
      .selectDistinctOn([users.id], {
        userId: users.id,
        name: users.name,
        image: users.image,
        groupName: sql<string>`(select name from groups where id = ${groupMemberships.groupId})`,
      })
      .from(groupMemberships)
      .innerJoin(users, eq(users.id, groupMemberships.userId))
      .where(
        and(
          inArray(
            groupMemberships.groupId,
            myGroups.map((g) => g.groupId),
          ),
          notInArray(users.id, excludedList),
        ),
      )
      .limit(SEARCH_LIMIT);

    return rows;
  }

  const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      image: users.image,
      groupName: sql<string | null>`(
        select g.name from group_memberships gm
        join groups g on g.id = gm.group_id
        where gm.user_id = ${users.id}
        and gm.group_id in (select group_id from group_memberships where user_id = ${userId})
        limit 1
      )`,
    })
    .from(users)
    .where(and(sql`${users.name} ilike ${escaped + '%'}`, notInArray(users.id, excludedList)))
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
  const rows = await db
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
  return rows;
}

export interface FriendView {
  userId: string;
  name: string | null;
  image: string | null;
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
  return db
    .select({ userId: users.id, name: users.name, image: users.image })
    .from(users)
    .where(inArray(users.id, friendIds));
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
  const rows = await db
    .select({ userId: users.id, name: users.name, image: users.image })
    .from(blocks)
    .innerJoin(users, eq(users.id, blocks.blockedId))
    .where(eq(blocks.blockerId, userId));
  return rows;
}
