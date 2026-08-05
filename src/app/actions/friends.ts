'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  blockUser,
  countIncomingFriendRequests,
  FriendError,
  removeFriend,
  respondToFriendRequest,
  searchFriendCandidates,
  sendFriendRequest,
  unblockUser,
  type FriendCandidate,
} from '@/lib/friends';

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not signed in.');
  return session.user.id;
}

function message(error: unknown, fallback: string): string {
  if (error instanceof FriendError) return error.message;
  return error instanceof Error ? error.message : fallback;
}

export async function getIncomingFriendRequestCountAction(): Promise<number> {
  const session = await auth();
  if (!session?.user?.id) return 0;
  return countIncomingFriendRequests(session.user.id);
}

export async function searchFriendCandidatesAction(query: string): Promise<FriendCandidate[]> {
  try {
    const userId = await requireUserId();
    return await searchFriendCandidates(userId, query);
  } catch {
    return [];
  }
}

export type FriendActionResult = { ok: true } | { ok: false; error: string };

export async function sendFriendRequestAction(targetUserId: string): Promise<FriendActionResult> {
  try {
    const userId = await requireUserId();
    await sendFriendRequest(userId, targetUserId);
    revalidatePath('/friends');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not send that request.') };
  }
}

export async function respondToFriendRequestAction(
  requestId: number,
  accept: boolean,
): Promise<FriendActionResult> {
  try {
    const userId = await requireUserId();
    await respondToFriendRequest(userId, requestId, accept);
    revalidatePath('/friends');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not respond to that request.') };
  }
}

export async function removeFriendAction(friendUserId: string): Promise<FriendActionResult> {
  try {
    const userId = await requireUserId();
    await removeFriend(userId, friendUserId);
    revalidatePath('/friends');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not remove that friend.') };
  }
}

export async function blockUserAction(targetUserId: string): Promise<FriendActionResult> {
  try {
    const userId = await requireUserId();
    await blockUser(userId, targetUserId);
    revalidatePath('/friends');
    revalidatePath('/duels');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not block that person.') };
  }
}

export async function unblockUserAction(targetUserId: string): Promise<FriendActionResult> {
  try {
    const userId = await requireUserId();
    await unblockUser(userId, targetUserId);
    revalidatePath('/friends');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not unblock that person.') };
  }
}
