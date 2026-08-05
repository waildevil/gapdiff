'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  addAccountToBoard,
  clearGroupWebhook,
  createGroup,
  createInvite,
  deleteGroup,
  GroupError,
  joinGroupByInvite,
  leaveGroup,
  removeAccountFromBoard,
  removeMember,
  renameGroup,
  revokeInvite,
  setMemberRole,
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

export type RenameGroupResult = { ok: true; name: string } | { ok: false; error: string };

export async function renameGroupAction(
  groupId: number,
  slug: string,
  name: string,
): Promise<RenameGroupResult> {
  try {
    const userId = await requireUserId();
    const renamed = await renameGroup(groupId, userId, name);
    revalidatePath(`/groups/${slug}/manage`);
    revalidatePath(`/group/${slug}`);
    revalidatePath('/groups');
    return { ok: true, name: renamed };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not rename the group.') };
  }
}

export type DeleteGroupResult = { ok: true } | { ok: false; error: string };

export async function deleteGroupAction(groupId: number): Promise<DeleteGroupResult> {
  try {
    const userId = await requireUserId();
    await deleteGroup(groupId, userId);
    revalidatePath('/groups');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not delete the group.') };
  }
}

export type RemoveMemberResult = { ok: true } | { ok: false; error: string };

export async function removeMemberAction(
  groupId: number,
  slug: string,
  targetUserId: string,
): Promise<RemoveMemberResult> {
  try {
    const userId = await requireUserId();
    await removeMember(groupId, userId, targetUserId);
    revalidatePath(`/groups/${slug}/manage`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not remove that member.') };
  }
}

export type LeaveGroupResult = { ok: true } | { ok: false; error: string };

export async function leaveGroupAction(groupId: number): Promise<LeaveGroupResult> {
  try {
    const userId = await requireUserId();
    await leaveGroup(groupId, userId);
    revalidatePath('/groups');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not leave that group.') };
  }
}

export type RoleResult = { ok: true } | { ok: false; error: string };

export async function setMemberRoleAction(
  groupId: number,
  slug: string,
  targetUserId: string,
  makeManager: boolean,
): Promise<RoleResult> {
  try {
    const userId = await requireUserId();
    await setMemberRole(groupId, userId, targetUserId, makeManager);
    revalidatePath(`/groups/${slug}/manage`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not change that role.') };
  }
}
