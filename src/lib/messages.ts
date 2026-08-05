import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { groupChatReads, groupMemberships, groups, messages, users } from '@/db/schema';
import { areFriends, isBlocked } from './friends';

/**
 * Messages, direct and group. Polling-based on purpose — no websocket, no
 * SSE — the client just asks "anything new?" every few seconds, which is
 * plenty responsive for a friend-group chat and needs no persistent
 * connection infrastructure.
 */

export class MessageError extends Error {}

const MAX_BODY = 2000;
const HISTORY_LIMIT = 100;

// --- direct messages -----------------------------------------------------

export async function sendMessage(
  senderId: string,
  recipientId: string,
  body: string,
): Promise<void> {
  if (senderId === recipientId) throw new MessageError("You can't message yourself.");
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new MessageError('Message is empty.');
  if (trimmed.length > MAX_BODY) throw new MessageError('That message is too long.');

  if (await isBlocked(senderId, recipientId)) {
    throw new MessageError("You can't message this person.");
  }
  if (!(await areFriends(senderId, recipientId))) {
    throw new MessageError('You can only message friends.');
  }

  await db.insert(messages).values({ senderId, recipientId, body: trimmed });
}

export interface MessageView {
  id: number;
  senderId: string;
  senderName: string | null;
  body: string;
  createdAt: Date;
  mine: boolean;
}

/** Oldest first, the way a chat thread reads. */
export async function listConversation(
  userId: string,
  otherUserId: string,
): Promise<MessageView[]> {
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      or(
        and(eq(messages.senderId, userId), eq(messages.recipientId, otherUserId)),
        and(eq(messages.senderId, otherUserId), eq(messages.recipientId, userId)),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LIMIT);

  return rows.reverse().map((row) => ({
    id: row.id,
    senderId: row.senderId,
    senderName: null,
    body: row.body,
    createdAt: row.createdAt,
    mine: row.senderId === userId,
  }));
}

/** Marks every DM from `otherUserId` as read, for the unread badge. */
export async function markConversationRead(userId: string, otherUserId: string): Promise<void> {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.senderId, otherUserId),
        eq(messages.recipientId, userId),
        sql`${messages.readAt} is null`,
      ),
    );
}

export interface ConversationPreview {
  userId: string;
  name: string | null;
  image: string | null;
  lastMessage: string;
  lastAt: Date;
  unread: number;
}

/** One row per person this user has ever exchanged DMs with, newest first. */
export async function listConversations(userId: string): Promise<ConversationPreview[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        isNull(messages.groupId),
        or(eq(messages.senderId, userId), eq(messages.recipientId, userId)),
      ),
    )
    .orderBy(desc(messages.createdAt));

  const byOther = new Map<string, { lastMessage: string; lastAt: Date; unread: number }>();

  for (const row of rows) {
    const otherId = row.senderId === userId ? row.recipientId! : row.senderId;
    const isUnreadToMe = row.recipientId === userId && row.readAt === null;

    const existing = byOther.get(otherId);
    if (!existing) {
      byOther.set(otherId, {
        lastMessage: row.body,
        lastAt: row.createdAt,
        unread: isUnreadToMe ? 1 : 0,
      });
    } else if (isUnreadToMe) {
      existing.unread += 1;
    }
  }

  if (byOther.size === 0) return [];

  const otherIds = [...byOther.keys()];
  const people = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(users)
    .where(inArray(users.id, otherIds));
  const peopleById = new Map(people.map((p) => [p.id, p]));

  return otherIds
    .map((otherId) => {
      const summary = byOther.get(otherId)!;
      const person = peopleById.get(otherId);
      return {
        userId: otherId,
        name: person?.name ?? null,
        image: person?.image ?? null,
        lastMessage: summary.lastMessage,
        lastAt: summary.lastAt,
        unread: summary.unread,
      };
    })
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export async function countUnreadMessages(userId: string): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.recipientId, userId), sql`${messages.readAt} is null`));
  return rows.length;
}

// --- group chat ------------------------------------------------------------

async function requireMember(userId: string, groupId: number): Promise<void> {
  const [row] = await db
    .select({ userId: groupMemberships.userId })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)))
    .limit(1);
  if (!row) throw new MessageError('You are not a member of that group.');
}

export async function sendGroupMessage(
  senderId: string,
  groupId: number,
  body: string,
): Promise<void> {
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new MessageError('Message is empty.');
  if (trimmed.length > MAX_BODY) throw new MessageError('That message is too long.');

  await requireMember(senderId, groupId);
  await db.insert(messages).values({ senderId, groupId, body: trimmed });
}

/** Oldest first. Every sender is named, since a group thread has more than one. */
export async function listGroupMessages(
  userId: string,
  groupId: number,
): Promise<MessageView[]> {
  await requireMember(userId, groupId);

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderName: users.name,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.groupId, groupId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LIMIT);

  return rows.reverse().map((row) => ({ ...row, mine: row.senderId === userId }));
}

/**
 * Stamped with Postgres's own `now()`, not the app server's — `lastReadAt`
 * gets compared against `messages.createdAt`, which is also DB-stamped
 * (`defaultNow()`). Comparing a DB clock against an app clock is a real bug
 * here, not a theoretical one: any skew flips `gt()` right when it matters
 * most, moments after sending, and "read" silently fails to clear unread.
 */
export async function markGroupRead(userId: string, groupId: number): Promise<void> {
  await db
    .insert(groupChatReads)
    .values({ groupId, userId, lastReadAt: sql`now()` })
    .onConflictDoUpdate({
      target: [groupChatReads.groupId, groupChatReads.userId],
      set: { lastReadAt: sql`now()` },
    });
}

export interface GroupChatPreview {
  groupId: number;
  groupName: string;
  lastMessage: string | null;
  lastAt: Date | null;
  unread: number;
}

/** One row per group this user belongs to — a room exists the moment the group does. */
export async function listGroupChats(userId: string): Promise<GroupChatPreview[]> {
  const myGroups = await db
    .select({ id: groups.id, name: groups.name })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(eq(groupMemberships.userId, userId));

  if (myGroups.length === 0) return [];

  const reads = await db
    .select({ groupId: groupChatReads.groupId, lastReadAt: groupChatReads.lastReadAt })
    .from(groupChatReads)
    .where(
      and(
        eq(groupChatReads.userId, userId),
        inArray(
          groupChatReads.groupId,
          myGroups.map((g) => g.id),
        ),
      ),
    );
  const lastReadByGroup = new Map(reads.map((r) => [r.groupId, r.lastReadAt]));

  return Promise.all(
    myGroups.map(async (group) => {
      const [latest] = await db
        .select({ body: messages.body, createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.groupId, group.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const lastReadAt = lastReadByGroup.get(group.id) ?? new Date(0);
      const unreadRows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.groupId, group.id),
            gt(messages.createdAt, lastReadAt),
            sql`${messages.senderId} != ${userId}`,
          ),
        );

      return {
        groupId: group.id,
        groupName: group.name,
        lastMessage: latest?.body ?? null,
        lastAt: latest?.createdAt ?? null,
        unread: unreadRows.length,
      };
    }),
  );
}

export async function countUnreadGroupMessages(userId: string): Promise<number> {
  const chats = await listGroupChats(userId);
  return chats.reduce((sum, chat) => sum + chat.unread, 0);
}
