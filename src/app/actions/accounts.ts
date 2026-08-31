'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  checkClaim,
  removeClaim,
  startClaim,
  VerificationError,
  type CheckResult,
} from '@/lib/verification';
import { riotProblem } from '@/lib/riot/problem';

/** Every action here mutates one user's own claims, so the session is the authority. */
async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not signed in.');
  return session.user.id;
}

export type ClaimResult =
  | { ok: true; puuid: string; requestedIconId: number; gameName: string; tagLine: string }
  | { ok: false; error: string };

export async function claimAccount(riotId: string, platform: string): Promise<ClaimResult> {
  try {
    const userId = await requireUserId();
    const challenge = await startClaim(userId, riotId.trim(), platform);
    revalidatePath('/accounts');
    return {
      ok: true,
      puuid: challenge.puuid,
      requestedIconId: challenge.requestedIconId,
      gameName: challenge.gameName,
      tagLine: challenge.tagLine,
    };
  } catch (error) {
    if (error instanceof VerificationError) return { ok: false, error: error.message };
    const problem = riotProblem(error);
    if (problem) return { ok: false, error: [problem.body, problem.hint].filter(Boolean).join(' ') };
    return {
      ok: false,
      error: 'Could not look that account up.',
    };
  }
}

export async function verifyAccount(
  puuid: string,
): Promise<CheckResult | { status: 'error'; error: string }> {
  try {
    const userId = await requireUserId();
    const result = await checkClaim(userId, puuid);
    if (result.status === 'verified') revalidatePath('/accounts');
    return result;
  } catch (error) {
    const problem = riotProblem(error);
    return {
      status: 'error',
      error: problem ? [problem.body, problem.hint].filter(Boolean).join(' ') : 'Verification failed.',
    };
  }
}

export async function forgetAccount(puuid: string): Promise<void> {
  const userId = await requireUserId();
  await removeClaim(userId, puuid);
  revalidatePath('/accounts');
}
