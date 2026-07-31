import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/db';
import { accountClaims, accounts, iconChallenges } from '@/db/schema';
import { syncClaimsToGroups } from './groups';
import { getRiotClient, RiotApiError } from './riot/client';
import { parsePlatform, parseRiotId, type Platform } from './riot/routing';

/**
 * Proving somebody owns a Riot account, without Riot Sign On.
 *
 * We ask them to set their profile icon to a specific one, then read it back
 * through SUMMONER-V4. Only somebody logged into that account can change its
 * icon, so a match is proof. It's the same shape as a DNS TXT record or a
 * confirmation email, and it needs no approval from Riot.
 */

/** The original default icons, which every account can select. */
const DEFAULT_ICON_POOL = Array.from({ length: 28 }, (_, i) => i + 1);

const CHALLENGE_TTL_MS = 15 * 60 * 1000;

export class VerificationError extends Error {}

/** Picks an icon the account isn't already wearing — otherwise doing nothing would pass. */
function pickIcon(currentIconId: number | null): number {
  const options = DEFAULT_ICON_POOL.filter((id) => id !== currentIconId);
  const index = Math.floor(Math.random() * options.length);
  return options[index] ?? 1;
}

export interface ChallengeView {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  requestedIconId: number;
  expiresAt: Date;
}

/**
 * Resolves a Riot ID, records the (unverified) claim, and issues an icon
 * challenge. Re-runnable: asking again replaces any outstanding challenge.
 */
export async function startClaim(
  userId: string,
  riotId: string,
  platformInput: string,
): Promise<ChallengeView> {
  const { gameName, tagLine } = parseRiotId(riotId);
  const platform: Platform = parsePlatform(platformInput);
  const riot = getRiotClient();

  let resolved;
  try {
    resolved = await riot.resolveRiotId(platform, gameName, tagLine);
  } catch (error) {
    if (error instanceof RiotApiError && error.isNotFound) {
      throw new VerificationError(
        `No account called ${gameName}#${tagLine} on ${platform.toUpperCase()}. Check the tag after the #.`,
      );
    }
    throw error;
  }

  const { account, summoner } = resolved;

  // Somebody else having *proved* ownership beats a fresh assertion.
  const [takenBy] = await db
    .select({ userId: accountClaims.userId })
    .from(accountClaims)
    .where(
      and(
        eq(accountClaims.puuid, account.puuid),
        ne(accountClaims.userId, userId),
        isNotNull(accountClaims.verifiedAt),
      ),
    )
    .limit(1);

  if (takenBy) {
    throw new VerificationError(
      'That account has already been verified by another user. If it is yours, ask them to release it.',
    );
  }

  await db
    .insert(accounts)
    .values({
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform,
      summonerId: summoner.id ?? null,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: accounts.puuid,
      set: {
        gameName: account.gameName,
        tagLine: account.tagLine,
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(accountClaims)
    .values({ userId, puuid: account.puuid })
    .onConflictDoNothing();

  const requestedIconId = pickIcon(summoner.profileIconId);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  // One live challenge per account: drop any earlier one first.
  await db
    .delete(iconChallenges)
    .where(and(eq(iconChallenges.userId, userId), eq(iconChallenges.puuid, account.puuid)));

  await db.insert(iconChallenges).values({
    userId,
    puuid: account.puuid,
    requestedIconId,
    previousIconId: summoner.profileIconId,
    expiresAt,
  });

  return {
    puuid: account.puuid,
    gameName: account.gameName,
    tagLine: account.tagLine,
    platform,
    requestedIconId,
    expiresAt,
  };
}

export type CheckResult =
  | { status: 'verified' }
  | { status: 'mismatch'; expected: number; actual: number | null }
  | { status: 'expired' }
  | { status: 'none' };

/** Reads the live icon back and settles the challenge. */
export async function checkClaim(userId: string, puuid: string): Promise<CheckResult> {
  const [challenge] = await db
    .select()
    .from(iconChallenges)
    .where(and(eq(iconChallenges.userId, userId), eq(iconChallenges.puuid, puuid)))
    .limit(1);

  if (!challenge) return { status: 'none' };
  if (challenge.consumedAt) return { status: 'verified' };
  if (challenge.expiresAt.getTime() < Date.now()) return { status: 'expired' };

  const [account] = await db
    .select({ platform: accounts.platform })
    .from(accounts)
    .where(eq(accounts.puuid, puuid))
    .limit(1);

  if (!account) return { status: 'none' };

  const riot = getRiotClient();
  const summoner = await riot.getSummonerByPuuid(account.platform as Platform, puuid);

  if (summoner.profileIconId !== challenge.requestedIconId) {
    return {
      status: 'mismatch',
      expected: challenge.requestedIconId,
      actual: summoner.profileIconId ?? null,
    };
  }

  const now = new Date();
  await db
    .update(accountClaims)
    .set({ verifiedAt: now, verifiedVia: 'profile-icon' })
    .where(and(eq(accountClaims.userId, userId), eq(accountClaims.puuid, puuid)));

  // Put it straight onto the boards of every group they're already in. Without
  // this, verifying after joining leaves you invisible on the leaderboard.
  await syncClaimsToGroups(userId);

  await db
    .update(iconChallenges)
    .set({ consumedAt: now })
    .where(eq(iconChallenges.id, challenge.id));

  await db
    .update(accounts)
    .set({ profileIconId: summoner.profileIconId, updatedAt: now })
    .where(eq(accounts.puuid, puuid));

  return { status: 'verified' };
}

export interface ClaimedAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  profileIconId: number | null;
  summonerLevel: number | null;
  verifiedAt: Date | null;
  pendingIconId: number | null;
  pendingExpiresAt: Date | null;
}

export async function listClaims(userId: string): Promise<ClaimedAccount[]> {
  const rows = await db
    .select({
      puuid: accounts.puuid,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
      platform: accounts.platform,
      profileIconId: accounts.profileIconId,
      summonerLevel: accounts.summonerLevel,
      verifiedAt: accountClaims.verifiedAt,
    })
    .from(accountClaims)
    .innerJoin(accounts, eq(accounts.puuid, accountClaims.puuid))
    .where(eq(accountClaims.userId, userId));

  const pending = await db
    .select()
    .from(iconChallenges)
    .where(eq(iconChallenges.userId, userId));

  return rows.map((row) => {
    const challenge = pending.find(
      (c) => c.puuid === row.puuid && !c.consumedAt && c.expiresAt.getTime() > Date.now(),
    );
    return {
      ...row,
      pendingIconId: challenge?.requestedIconId ?? null,
      pendingExpiresAt: challenge?.expiresAt ?? null,
    };
  });
}

export async function removeClaim(userId: string, puuid: string): Promise<void> {
  await db
    .delete(accountClaims)
    .where(and(eq(accountClaims.userId, userId), eq(accountClaims.puuid, puuid)));
  await db
    .delete(iconChallenges)
    .where(and(eq(iconChallenges.userId, userId), eq(iconChallenges.puuid, puuid)));
}
