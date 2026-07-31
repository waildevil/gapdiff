'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  createGroup,
  createInvite,
  GroupError,
  joinGroupByInvite,
  revokeInvite,
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
