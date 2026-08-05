import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { messages, users } from '@/db/schema';
import { areFriends, isBlocked } from './friends';

/**
 * Direct messages, friends-only. Polling-based on purpose — no websocket, no
 * SSE — the client just asks "anything new?" every few seconds, which is
 * plenty responsive for a friend-group chat and needs no persistent
 * connection infrastructure.
 */

export class MessageError extends Error {}

const MAX_BODY = 2000;
const HISTORY_LIMIT = 100;

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
    .select()
    .from(messages)
    .where(
      or(
        and(eq(messages.senderId, userId), eq(messages.recipientId, otherUserId)),
        and(eq(messages.senderId, otherUserId), eq(messages.recipientId, userId)),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LIMIT);

  return rows
    .reverse()
    .map((row) => ({
      id: row.id,
      senderId: row.senderId,
      body: row.body,
      createdAt: row.createdAt,
      mine: row.senderId === userId,
    }));
}

/** Marks every message from `otherUserId` as read, for the unread badge. */
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

/** One row per person this user has ever exchanged messages with, newest first. */
export async function listConversations(userId: string): Promise<ConversationPreview[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(or(eq(messages.senderId, userId), eq(messages.recipientId, userId)))
    .orderBy(desc(messages.createdAt));

  const byOther = new Map<
    string,
    { lastMessage: string; lastAt: Date; unread: number }
  >();

  for (const row of rows) {
    const otherId = row.senderId === userId ? row.recipientId : row.senderId;
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
