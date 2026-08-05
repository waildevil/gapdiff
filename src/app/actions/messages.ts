'use server';

import { auth } from '@/auth';
import {
  countUnreadMessages,
  listConversation,
  listConversations,
  markConversationRead,
  MessageError,
  sendMessage,
  type ConversationPreview,
  type MessageView,
} from '@/lib/messages';

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not signed in.');
  return session.user.id;
}

export type SendMessageResult = { ok: true } | { ok: false; error: string };

export async function sendMessageAction(
  toUserId: string,
  body: string,
): Promise<SendMessageResult> {
  try {
    const userId = await requireUserId();
    await sendMessage(userId, toUserId, body);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof MessageError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Could not send that message.';
    return { ok: false, error: message };
  }
}

/** Polled by the chat widget. Marks the thread read as a side effect of opening it. */
export async function getConversationAction(otherUserId: string): Promise<MessageView[]> {
  try {
    const userId = await requireUserId();
    await markConversationRead(userId, otherUserId);
    return await listConversation(userId, otherUserId);
  } catch {
    return [];
  }
}

export async function getConversationsAction(): Promise<ConversationPreview[]> {
  try {
    const userId = await requireUserId();
    return await listConversations(userId);
  } catch {
    return [];
  }
}

export async function getUnreadMessageCountAction(): Promise<number> {
  try {
    const userId = await requireUserId();
    return await countUnreadMessages(userId);
  } catch {
    return 0;
  }
}
