'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  addAccountToBoard,
  clearGroupWebhook,
  createGroup,
  createInvite,
  GroupError,
  joinGroupByInvite,
  removeAccountFromBoard,
  revokeInvite,
  setGroupWebhook,
} from '@/lib/groups';

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not signed in.');
  return session.user.id;
}

function message(error: unknown, fallback: string): string {
  if (error instanceof GroupError) return error.message;
  return error instanceof Error ? error.message : fallback;
}

export type CreateGroupResult =
  | { ok: true; slug: string; trackedCount: number }
  | { ok: false; error: string };

export async function createGroupAction(name: string): Promise<CreateGroupResult> {
  try {
    const userId = await requireUserId();
    const group = await createGroup(userId, name);
    revalidatePath('/groups');
    return { ok: true, slug: group.slug, trackedCount: group.trackedCount };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not create the group.') };
  }
}

export type InviteResult = { ok: true; code: string } | { ok: false; error: string };

export async function createInviteAction(
  groupId: number,
  slug: string,
  expiresInDays: number | null,
  maxUses: number | null,
): Promise<InviteResult> {
  try {
    const userId = await requireUserId();
    const invite = await createInvite(groupId, userId, { expiresInDays, maxUses });
    revalidatePath(`/groups/${slug}/manage`);
    return { ok: true, code: invite.code };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not create the invite.') };
  }
}

export async function revokeInviteAction(code: string, slug: string): Promise<void> {
  const userId = await requireUserId();
  await revokeInvite(code, userId);
  revalidatePath(`/groups/${slug}/manage`);
}

export type BoardResult = { ok: true } | { ok: false; error: string };

/**
 * Members control which of their own accounts appear on a board — smurfs are
 * normal, and not everybody wants every account counted.
 */
export async function setAccountOnBoard(
  groupId: number,
  slug: string,
  puuid: string,
  onBoard: boolean,
): Promise<BoardResult> {
  try {
    const userId = await requireUserId();
    if (onBoard) await addAccountToBoard(groupId, userId, puuid);
    else await removeAccountFromBoard(groupId, userId, puuid);
    revalidatePath(`/group/${slug}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not update the board.') };
  }
}

export type JoinResultAction =
  | { ok: true; slug: string; trackedCount: number; alreadyMember: boolean }
  | { ok: false; error: string };

export async function joinGroupAction(code: string): Promise<JoinResultAction> {
  try {
    const userId = await requireUserId();
    const result = await joinGroupByInvite(code, userId);
    revalidatePath('/groups');
    revalidatePath(`/group/${result.slug}`);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not join that group.') };
  }
}

export type WebhookResult = { ok: true; hint: string | null } | { ok: false; error: string };

export async function connectDiscordAction(
  groupId: number,
  slug: string,
  url: string,
): Promise<WebhookResult> {
  try {
    const userId = await requireUserId();
    const hint = await setGroupWebhook(groupId, userId, url);
    revalidatePath(`/groups/${slug}/manage`);
    return { ok: true, hint };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not save that webhook.') };
  }
}

export async function disconnectDiscordAction(
  groupId: number,
  slug: string,
): Promise<WebhookResult> {
  try {
    const userId = await requireUserId();
    await clearGroupWebhook(groupId, userId);
    revalidatePath(`/groups/${slug}/manage`);
    return { ok: true, hint: null };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not disconnect Discord.') };
  }
}
