import { randomBytes } from 'node:crypto';
import { and, count, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { connectedPayload, postToDiscord } from './discord';
import {
  decryptSecret,
  encryptSecret,
  hasSecretKey,
  validateWebhookUrl,
} from './secrets';
import {
  accountClaims,
  accounts,
  groupMemberships,
  groups,
  invites,
  trackedAccounts,
  users,
} from '@/db/schema';

/**
 * Groups, invites and joining.
 *
 * A group has two populations that are deliberately not the same thing:
 * `group_memberships` is the people, `tracked_accounts` is the Riot accounts on
 * the board. One person can put several accounts up; an account can sit there
 * with nobody attached, which is how you keep tracking somebody who has stopped
 * playing or won't sign in.
 */

export class GroupError extends Error {}

const SLUG_MAX = 48;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, SLUG_MAX);
  return base || 'group';
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [taken] = await db
      .select({ slug: groups.slug })
      .from(groups)
      .where(eq(groups.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${randomBytes(3).toString('hex')}`;
}

/** URL-safe, no ambiguous characters, short enough to paste in chat. */
function inviteCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export interface GroupSummary {
  id: number;
  slug: string;
  name: string;
  isOwner: boolean;
  memberCount: number;
  trackedCount: number;
}

export async function listUserGroups(userId: string): Promise<GroupSummary[]> {
  const rows = await db
    .select({
      id: groups.id,
      slug: groups.slug,
      name: groups.name,
      ownerId: groups.ownerId,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(eq(groupMemberships.userId, userId))
    .orderBy(desc(groups.createdAt));

  return Promise.all(
    rows.map(async (row) => {
      const [members] = await db
        .select({ n: count() })
        .from(groupMemberships)
        .where(eq(groupMemberships.groupId, row.id));
      const [tracked] = await db
        .select({ n: count() })
        .from(trackedAccounts)
        .where(eq(trackedAccounts.groupId, row.id));
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        isOwner: row.ownerId === userId || row.role === 'owner',
        memberCount: members?.n ?? 0,
        trackedCount: tracked?.n ?? 0,
      };
    }),
  );
}

/**
 * Puts every account this user has claimed onto a group's board.
 *
 * Deliberately all of them rather than a picker: smurfs are the normal case,
 * and an account can be removed from the board afterwards in one click.
 */
async function trackClaimedAccounts(groupId: number, userId: string): Promise<number> {
  const claimed = await db
    .select({ puuid: accountClaims.puuid })
    .from(accountClaims)
    .where(eq(accountClaims.userId, userId));

  if (claimed.length === 0) return 0;

  await db
    .insert(trackedAccounts)
    .values(claimed.map((c) => ({ groupId, puuid: c.puuid, addedBy: userId })))
    .onConflictDoNothing();

  return claimed.length;
}

/**
 * Adds every account this user has claimed to every group they are already in.
 *
 * Called after a claim is verified, because the alternative bites: joining a
 * group before claiming an account left you permanently invisible, and the only
 * cure was an owner running SQL.
 */
export async function syncClaimsToGroups(userId: string): Promise<number> {
  const claimed = await db
    .select({ puuid: accountClaims.puuid })
    .from(accountClaims)
    .where(eq(accountClaims.userId, userId));

  const memberships = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(eq(groupMemberships.userId, userId));

  if (claimed.length === 0 || memberships.length === 0) return 0;

  const rows = memberships.flatMap((m) =>
    claimed.map((c) => ({ groupId: m.groupId, puuid: c.puuid, addedBy: userId })),
  );

  const inserted = await db
    .insert(trackedAccounts)
    .values(rows)
    .onConflictDoNothing()
    .returning({ puuid: trackedAccounts.puuid });

  return inserted.length;
}

/** One of the user's accounts, and whether it is on a given group's board. */
export interface BoardAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  verified: boolean;
  onBoard: boolean;
}

export async function listMyAccountsForGroup(
  groupId: number,
  userId: string,
): Promise<BoardAccount[]> {
  const claimed = await db
    .select({
      puuid: accounts.puuid,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
      platform: accounts.platform,
      verifiedAt: accountClaims.verifiedAt,
    })
    .from(accountClaims)
    .innerJoin(accounts, eq(accounts.puuid, accountClaims.puuid))
    .where(eq(accountClaims.userId, userId));

  if (claimed.length === 0) return [];

  const onBoard = await db
    .select({ puuid: trackedAccounts.puuid })
    .from(trackedAccounts)
    .where(eq(trackedAccounts.groupId, groupId));

  const tracked = new Set(onBoard.map((row) => row.puuid));

  return claimed.map((account) => ({
    puuid: account.puuid,
    gameName: account.gameName,
    tagLine: account.tagLine,
    platform: account.platform,
    verified: account.verifiedAt !== null,
    onBoard: tracked.has(account.puuid),
  }));
}

async function assertCanManageAccount(
  groupId: number,
  userId: string,
  puuid: string,
): Promise<void> {
  const [membership] = await db
    .select({ userId: groupMemberships.userId })
    .from(groupMemberships)
    .where(
      and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)),
    )
    .limit(1);

  if (!membership) throw new GroupError('You are not a member of that group.');

  const [claim] = await db
    .select({ puuid: accountClaims.puuid })
    .from(accountClaims)
    .where(and(eq(accountClaims.userId, userId), eq(accountClaims.puuid, puuid)))
    .limit(1);

  if (!claim) throw new GroupError('That account is not yours.');
}

export async function addAccountToBoard(
  groupId: number,
  userId: string,
  puuid: string,
): Promise<void> {
  await assertCanManageAccount(groupId, userId, puuid);
  await db
    .insert(trackedAccounts)
    .values({ groupId, puuid, addedBy: userId })
    .onConflictDoNothing();
}

export async function removeAccountFromBoard(
  groupId: number,
  userId: string,
  puuid: string,
): Promise<void> {
  await assertCanManageAccount(groupId, userId, puuid);
  await db
    .delete(trackedAccounts)
    .where(and(eq(trackedAccounts.groupId, groupId), eq(trackedAccounts.puuid, puuid)));
}

export async function createGroup(userId: string, name: string): Promise<GroupSummary> {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new GroupError('Give the group a name.');
  if (trimmed.length > 64) throw new GroupError('That name is too long.');

  const slug = await uniqueSlug(trimmed);

  const [group] = await db
    .insert(groups)
    .values({ slug, name: trimmed, ownerId: userId, isPrivate: true })
    .returning();

  if (!group) throw new GroupError('Could not create the group.');

  await db
    .insert(groupMemberships)
    .values({ groupId: group.id, userId, role: 'owner' })
    .onConflictDoNothing();

  const tracked = await trackClaimedAccounts(group.id, userId);

  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    isOwner: true,
    memberCount: 1,
    trackedCount: tracked,
  };
}

export async function renameGroup(groupId: number, userId: string, name: string): Promise<string> {
  if (!(await isOwner(groupId, userId))) {
    throw new GroupError('Only the group owner can rename it.');
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new GroupError('Give the group a name.');
  if (trimmed.length > 64) throw new GroupError('That name is too long.');

  await db.update(groups).set({ name: trimmed }).where(eq(groups.id, groupId));
  return trimmed;
}

/**
 * Deletes the group itself. Memberships, tracked accounts and invites cascade
 * from the FK on `group_id` — nothing else to clean up by hand. Riot accounts,
 * matches and rank history are untouched: they're global, not the group's.
 */
export async function deleteGroup(groupId: number, userId: string): Promise<void> {
  if (!(await isOwner(groupId, userId))) {
    throw new GroupError('Only the group owner can delete this group.');
  }
  await db.delete(groups).where(eq(groups.id, groupId));
}

/**
 * Removes somebody else from the group. Only the founder can — same gate as
 * renaming or deleting the group, see the isOwner() docstring below.
 *
 * Their tracked accounts stay on the board, same as seed-group.ts dropping
 * somebody from the config: the games they played in are still context for
 * everyone else, and the account just becomes unclaimed rather than gone.
 */
export async function removeMember(
  groupId: number,
  actingUserId: string,
  targetUserId: string,
): Promise<void> {
  if (!(await isOwner(groupId, actingUserId))) {
    throw new GroupError('Only the group owner can remove a member.');
  }

  const [group] = await db
    .select({ ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (group?.ownerId === targetUserId) {
    throw new GroupError('The founder can\'t be removed. Delete the group instead.');
  }

  await db
    .delete(groupMemberships)
    .where(
      and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, targetUserId)),
    );
}

/**
 * Leaving is removeMember on yourself, with one extra rule: the founder can't
 * use it. Deleting the membership row would leave `groups.ownerId` pointing
 * at somebody no longer in the group, and the manage page — gated on
 * isOwner(), which checks ownerId first — would still let them back in with
 * nobody else able to run it. Delete the group instead is the real off-ramp.
 */
export async function leaveGroup(groupId: number, userId: string): Promise<void> {
  const [group] = await db
    .select({ ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new GroupError('That group does not exist.');
  if (group.ownerId === userId) {
    throw new GroupError('The founder can\'t leave. Delete the group instead.');
  }

  const result = await db
    .delete(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)))
    .returning({ userId: groupMemberships.userId });

  if (result.length === 0) throw new GroupError('You are not in this group.');
}

export async function isOwner(groupId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: groups.id })
    .from(groups)
    .leftJoin(
      groupMemberships,
      and(eq(groupMemberships.groupId, groups.id), eq(groupMemberships.userId, userId)),
    )
    .where(
      and(
        eq(groups.id, groupId),
        or(eq(groups.ownerId, userId), eq(groupMemberships.role, 'owner')),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export interface InviteView {
  code: string;
  createdAt: Date;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
  revokedAt: Date | null;
  active: boolean;
}

function inviteIsActive(row: {
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
  revokedAt: Date | null;
}): boolean {
  if (row.revokedAt) return false;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return false;
  if (row.maxUses !== null && row.uses >= row.maxUses) return false;
  return true;
}

export async function createInvite(
  groupId: number,
  userId: string,
  options: { expiresInDays?: number | null; maxUses?: number | null } = {},
): Promise<InviteView> {
  if (!(await isOwner(groupId, userId))) {
    throw new GroupError('Only the group owner can create invites.');
  }

  const expiresAt =
    options.expiresInDays && options.expiresInDays > 0
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const [row] = await db
    .insert(invites)
    .values({
      code: inviteCode(),
      groupId,
      createdBy: userId,
      expiresAt,
      maxUses: options.maxUses ?? null,
    })
    .returning();

  if (!row) throw new GroupError('Could not create the invite.');
  return { ...row, active: inviteIsActive(row) };
}

export async function listInvites(groupId: number): Promise<InviteView[]> {
  const rows = await db
    .select()
    .from(invites)
    .where(eq(invites.groupId, groupId))
    .orderBy(desc(invites.createdAt));
  return rows.map((row) => ({ ...row, active: inviteIsActive(row) }));
}

export async function revokeInvite(
  code: string,
  userId: string,
): Promise<void> {
  const [row] = await db.select().from(invites).where(eq(invites.code, code)).limit(1);
  if (!row) throw new GroupError('No such invite.');
  if (!(await isOwner(row.groupId, userId))) {
    throw new GroupError('Only the group owner can revoke invites.');
  }
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(eq(invites.code, code));
}

export interface InviteTarget {
  code: string;
  group: { id: number; slug: string; name: string };
  invitedBy: string | null;
  active: boolean;
  reason: 'revoked' | 'expired' | 'exhausted' | null;
}

export async function getInvite(code: string): Promise<InviteTarget | null> {
  const [row] = await db
    .select({
      code: invites.code,
      groupId: invites.groupId,
      expiresAt: invites.expiresAt,
      maxUses: invites.maxUses,
      uses: invites.uses,
      revokedAt: invites.revokedAt,
      slug: groups.slug,
      name: groups.name,
      inviterName: users.name,
    })
    .from(invites)
    .innerJoin(groups, eq(groups.id, invites.groupId))
    .leftJoin(users, eq(users.id, invites.createdBy))
    .where(eq(invites.code, code))
    .limit(1);

  if (!row) return null;

  let reason: InviteTarget['reason'] = null;
  if (row.revokedAt) reason = 'revoked';
  else if (row.expiresAt && row.expiresAt.getTime() < Date.now()) reason = 'expired';
  else if (row.maxUses !== null && row.uses >= row.maxUses) reason = 'exhausted';

  return {
    code: row.code,
    group: { id: row.groupId, slug: row.slug, name: row.name },
    invitedBy: row.inviterName,
    active: reason === null,
    reason,
  };
}

export interface JoinResult {
  slug: string;
  trackedCount: number;
  alreadyMember: boolean;
}

export async function joinGroupByInvite(code: string, userId: string): Promise<JoinResult> {
  const invite = await getInvite(code);
  if (!invite) throw new GroupError('That invite link is not valid.');
  if (!invite.active) {
    const messages = {
      revoked: 'That invite has been revoked.',
      expired: 'That invite has expired.',
      exhausted: 'That invite has been used up.',
    } as const;
    throw new GroupError(messages[invite.reason ?? 'revoked']);
  }

  const [existing] = await db
    .select({ userId: groupMemberships.userId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, invite.group.id),
        eq(groupMemberships.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    const tracked = await trackClaimedAccounts(invite.group.id, userId);
    return { slug: invite.group.slug, trackedCount: tracked, alreadyMember: true };
  }

  await db
    .insert(groupMemberships)
    .values({ groupId: invite.group.id, userId, role: 'member' });

  // Count the use against the invite, not against the person — rejoining after
  // leaving shouldn't burn another slot, but a fresh join should.
  await db
    .update(invites)
    .set({ uses: sql`${invites.uses} + 1` })
    .where(eq(invites.code, code));

  const tracked = await trackClaimedAccounts(invite.group.id, userId);
  return { slug: invite.group.slug, trackedCount: tracked, alreadyMember: false };
}

export interface GroupMemberView {
  userId: string;
  name: string | null;
  image: string | null;
  role: string;
  /** Created the group. Can manage, and can never be demoted by anybody. */
  isFounder: boolean;
  /** Manages the group — the founder, or anybody they promoted. */
  canManage: boolean;
  joinedAt: Date;
  accounts: { puuid: string; gameName: string; tagLine: string; verified: boolean }[];
}

export async function listMembers(groupId: number): Promise<GroupMemberView[]> {
  const [group] = await db
    .select({ ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  const people = await db
    .select({
      userId: groupMemberships.userId,
      name: users.name,
      image: users.image,
      role: groupMemberships.role,
      joinedAt: groupMemberships.joinedAt,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(eq(groupMemberships.groupId, groupId));

  return Promise.all(
    people.map(async (person) => {
      const owned = await db
        .select({
          puuid: accounts.puuid,
          gameName: accounts.gameName,
          tagLine: accounts.tagLine,
          verifiedAt: accountClaims.verifiedAt,
        })
        .from(trackedAccounts)
        .innerJoin(accounts, eq(accounts.puuid, trackedAccounts.puuid))
        .innerJoin(
          accountClaims,
          and(
            eq(accountClaims.puuid, trackedAccounts.puuid),
            eq(accountClaims.userId, person.userId),
          ),
        )
        .where(eq(trackedAccounts.groupId, groupId));

      const isFounder = group?.ownerId !== null && group?.ownerId === person.userId;

      return {
        ...person,
        isFounder,
        canManage: isFounder || person.role === MANAGER_ROLE,
        accounts: owned.map((a) => ({
          puuid: a.puuid,
          gameName: a.gameName,
          tagLine: a.tagLine,
          verified: a.verifiedAt !== null,
        })),
      };
    }),
  );
}

/** Accounts on the board that nobody has claimed — seeded or manually added. */
export async function listUnclaimedAccounts(groupId: number) {
  return db
    .select({
      puuid: accounts.puuid,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
    })
    .from(trackedAccounts)
    .innerJoin(accounts, eq(accounts.puuid, trackedAccounts.puuid))
    .leftJoin(accountClaims, eq(accountClaims.puuid, trackedAccounts.puuid))
    .where(and(eq(trackedAccounts.groupId, groupId), isNull(accountClaims.puuid)));
}

// --- Discord connection ---------------------------------------------------

export interface DiscordConnection {
  connected: boolean;
  /** Masked, e.g. "…/webhooks/123/••••". Null when nothing is stored. */
  hint: string | null;
  /**
   * True when a webhook is stored but cannot be decrypted — SECRET_KEY missing
   * or changed. Surfaced so the owner is told to reconnect rather than left
   * wondering why a connected-looking group never posts.
   */
  unreadable: boolean;
}

export async function getDiscordConnection(groupId: number): Promise<DiscordConnection> {
  const [row] = await db
    .select({ blob: groups.discordWebhook, hint: groups.discordWebhookHint })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!row?.blob) return { connected: false, hint: null, unreadable: false };

  return {
    connected: true,
    hint: row.hint,
    unreadable: decryptSecret(row.blob) === null,
  };
}

/**
 * Stores a group's webhook, encrypted.
 *
 * Owner only. The URL is validated before it is ever stored: without that check
 * an owner could point the group at any address and the nightly job would POST
 * to it from our infrastructure, which turns the scheduler into a request
 * forwarder rather than merely leaking one channel.
 */
export async function setGroupWebhook(
  groupId: number,
  userId: string,
  url: string,
): Promise<string> {
  if (!(await isOwner(groupId, userId))) {
    throw new GroupError('Only the group owner can connect Discord.');
  }
  if (!hasSecretKey()) {
    throw new GroupError('The server has no encryption key configured, so this cannot be stored.');
  }

  const check = validateWebhookUrl(url);
  if (!check.ok) throw new GroupError(check.error ?? 'That webhook URL is not valid.');

  const trimmed = url.trim();

  /*
   * Prove it works before keeping it. A webhook that stores cleanly but cannot
   * post is indistinguishable from a quiet group, and the owner would only find
   * out days later when the digest never arrived.
   */
  const [group] = await db
    .select({ name: groups.name, slug: groups.slug })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  try {
    await postToDiscord(trimmed, connectedPayload(group?.name ?? 'This group', group?.slug ?? ''));
  } catch (cause) {
    throw new GroupError(
      `Discord refused that webhook, so it was not saved. ${(cause as Error).message}`,
    );
  }

  await db
    .update(groups)
    .set({ discordWebhook: encryptSecret(trimmed), discordWebhookHint: check.display })
    .where(eq(groups.id, groupId));

  return check.display!;
}

export async function clearGroupWebhook(groupId: number, userId: string): Promise<void> {
  if (!(await isOwner(groupId, userId))) {
    throw new GroupError('Only the group owner can disconnect Discord.');
  }
  await db
    .update(groups)
    .set({ discordWebhook: null, discordWebhookHint: null })
    .where(eq(groups.id, groupId));
}

/** The decrypted webhook, for the poster. Never send this to a browser. */
export async function getGroupWebhookUrl(slug: string): Promise<string | null> {
  const [row] = await db
    .select({ blob: groups.discordWebhook })
    .from(groups)
    .where(eq(groups.slug, slug))
    .limit(1);

  return row?.blob ? decryptSecret(row.blob) : null;
}

// --- co-managers ----------------------------------------------------------

/**
 * The single management role.
 *
 * One role rather than a hierarchy: a co-manager can do everything the founder
 * can, including promoting others. The founder is the one exception, and it is
 * enforced on the row rather than by role — see setMemberRole.
 */
export const MANAGER_ROLE = 'owner';

/**
 * Promotes or demotes a member.
 *
 * The founder can never be demoted, by anybody, including themselves. Roles are
 * symmetric here — a co-manager can promote and demote other co-managers — so
 * without that rule two people could remove each other and a group could end up
 * with nobody able to manage it, or somebody could quietly lock the creator out
 * of the board they made.
 */
export async function setMemberRole(
  groupId: number,
  actingUserId: string,
  targetUserId: string,
  makeManager: boolean,
): Promise<void> {
  if (!(await isOwner(groupId, actingUserId))) {
    throw new GroupError('Only a manager can change who manages this group.');
  }

  const [group] = await db
    .select({ ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!makeManager && group?.ownerId === targetUserId) {
    throw new GroupError('The person who created the group always manages it.');
  }

  const [membership] = await db
    .select({ userId: groupMemberships.userId })
    .from(groupMemberships)
    .where(
      and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, targetUserId)),
    )
    .limit(1);

  if (!membership) throw new GroupError('That person is not in this group.');

  await db
    .update(groupMemberships)
    .set({ role: makeManager ? MANAGER_ROLE : 'member' })
    .where(
      and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, targetUserId)),
    );
}
