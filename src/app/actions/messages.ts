'use server';

import { auth } from '@/auth';
import {
  countUnreadGroupMessages,
  countUnreadMessages,
  listConversation,
  listConversations,
  listGroupChats,
  listGroupMessages,
  markConversationRead,
  markGroupRead,
  MessageError,
  sendGroupMessage,
  sendMessage,
  type ConversationPreview,
  type GroupChatPreview,
  type MessageView,
} from '@/lib/messages';

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not signed in.');
  return session.user.id;
}

function message(error: unknown, fallback: string): string {
  if (error instanceof MessageError) return error.message;
  return error instanceof Error ? error.message : fallback;
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
    return { ok: false, error: message(error, 'Could not send that message.') };
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

export interface ChatList {
  conversations: ConversationPreview[];
  groupChats: GroupChatPreview[];
}

/** Both lists in one round trip — the widget's landing view polls this, not the two separately. */
export async function getChatListAction(): Promise<ChatList> {
  try {
    const userId = await requireUserId();
    const [conversations, groupChats] = await Promise.all([
      listConversations(userId),
      listGroupChats(userId),
    ]);
    return { conversations, groupChats };
  } catch {
    return { conversations: [], groupChats: [] };
  }
}

export async function sendGroupMessageAction(
  groupId: number,
  body: string,
): Promise<SendMessageResult> {
  try {
    const userId = await requireUserId();
    await sendGroupMessage(userId, groupId, body);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not send that message.') };
  }
}

/** Polled by the chat widget. Marks the group thread read as a side effect of opening it. */
export async function getGroupMessagesAction(groupId: number): Promise<MessageView[]> {
  try {
    const userId = await requireUserId();
    const rows = await listGroupMessages(userId, groupId);
    await markGroupRead(userId, groupId);
    return rows;
  } catch {
    return [];
  }
}

export async function getGroupChatsAction(): Promise<GroupChatPreview[]> {
  try {
    const userId = await requireUserId();
    return await listGroupChats(userId);
  } catch {
    return [];
  }
}

export async function getUnreadMessageCountAction(): Promise<number> {
  try {
    const userId = await requireUserId();
    const [dm, group] = await Promise.all([
      countUnreadMessages(userId),
      countUnreadGroupMessages(userId),
    ]);
    return dm + group;
  } catch {
    return 0;
  }
}
