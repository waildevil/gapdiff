'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { createDuel, DuelError } from '@/lib/duels';

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not signed in.');
  return session.user.id;
}

function message(error: unknown, fallback: string): string {
  if (error instanceof DuelError) return error.message;
  return error instanceof Error ? error.message : fallback;
}

export type CreateDuelResult = { ok: true; code: string } | { ok: false; error: string };

export async function createDuelAction(
  groupId: number,
  slug: string,
  puuids: string[],
  days: number,
): Promise<CreateDuelResult> {
  try {
    const userId = await requireUserId();
    const duel = await createDuel(groupId, userId, puuids, days);
    revalidatePath(`/group/${slug}`);
    return { ok: true, code: duel.code };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not start the duel.') };
  }
}
