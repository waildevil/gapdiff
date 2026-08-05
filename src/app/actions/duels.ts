'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  createDuel,
  DuelError,
  respondToDuel,
  searchDuelTargets,
  type DuelTargetCandidate,
} from '@/lib/duels';

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not signed in.');
  return session.user.id;
}

function message(error: unknown, fallback: string): string {
  if (error instanceof DuelError) return error.message;
  return error instanceof Error ? error.message : fallback;
}

export async function searchDuelTargetsAction(query: string): Promise<DuelTargetCandidate[]> {
  try {
    const userId = await requireUserId();
    return await searchDuelTargets(userId, query);
  } catch {
    return [];
  }
}

export type CreateDuelResult = { ok: true; code: string } | { ok: false; error: string };

export async function createDuelAction(
  creatorPuuid: string,
  targetPuuids: string[],
  minutes: number,
): Promise<CreateDuelResult> {
  try {
    const userId = await requireUserId();
    const duel = await createDuel(userId, creatorPuuid, targetPuuids, minutes);
    revalidatePath('/duels');
    return { ok: true, code: duel.code };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not start the duel.') };
  }
}

export type RespondResult = { ok: true } | { ok: false; error: string };

export async function respondToDuelAction(
  duelId: number,
  puuid: string,
  accept: boolean,
): Promise<RespondResult> {
  try {
    const userId = await requireUserId();
    await respondToDuel(userId, duelId, puuid, accept);
    revalidatePath('/duels');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, 'Could not respond to that challenge.') };
  }
}
