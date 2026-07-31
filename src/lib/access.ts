import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { groupMemberships, groups } from '@/db/schema';

/**
 * Who may read a group's standings.
 *
 * Private is the default, because the whole point of an invite is that the
 * group is closed. Public groups exist so a group can choose to be linkable.
 */
export type Access =
  | { allowed: true; group: { id: number; slug: string; name: string }; isMember: boolean; isOwner: boolean }
  | { allowed: false; reason: 'not-found' }
  | { allowed: false; reason: 'private'; groupName: string; signedIn: boolean };

export async function checkGroupAccess(
  slug: string,
  userId: string | undefined,
): Promise<Access> {
  const [group] = await db.select().from(groups).where(eq(groups.slug, slug)).limit(1);
  if (!group) return { allowed: false, reason: 'not-found' };

  const membership = userId
    ? (
        await db
          .select({ role: groupMemberships.role })
          .from(groupMemberships)
          .where(
            and(
              eq(groupMemberships.groupId, group.id),
              eq(groupMemberships.userId, userId),
            ),
          )
          .limit(1)
      )[0]
    : undefined;

  const isMember = Boolean(membership);
  const isOwner = group.ownerId === userId || membership?.role === 'owner';

  if (group.isPrivate && !isMember) {
    return {
      allowed: false,
      reason: 'private',
      groupName: group.name,
      signedIn: Boolean(userId),
    };
  }

  return {
    allowed: true,
    group: { id: group.id, slug: group.slug, name: group.name },
    isMember,
    isOwner,
  };
}
