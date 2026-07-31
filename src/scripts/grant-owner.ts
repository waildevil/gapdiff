import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db, runScript } from '@/db';
import { groupMemberships, groups, users } from '@/db/schema';

/**
 * Hands a group to a signed-in user.
 *
 * Needed for groups that predate authentication — they were seeded from
 * config/group.json and have no owner, so nobody can manage or invite to them.
 *
 *   npm run grant-owner -- the-boys
 *   npm run grant-owner -- the-boys "Discord Name"
 */
async function main() {
  const slug = process.argv[2];
  const nameHint = process.argv[3];

  const allUsers = await db.select().from(users);
  if (allUsers.length === 0) {
    console.error('No users have signed in yet.');
    process.exitCode = 1;
    return;
  }

  if (!slug) {
    console.log('Usage: npm run grant-owner -- <group-slug> [user name]\n');
    console.log('Groups:');
    for (const g of await db.select().from(groups)) {
      console.log(`  ${g.slug.padEnd(24)} ${g.name}  owner=${g.ownerId ?? 'none'}`);
    }
    console.log('\nUsers:');
    for (const u of allUsers) console.log(`  ${u.id}  ${u.name ?? '(no name)'}`);
    return;
  }

  const user = nameHint
    ? allUsers.find((u) => (u.name ?? '').toLowerCase() === nameHint.toLowerCase())
    : allUsers.length === 1
      ? allUsers[0]
      : undefined;

  if (!user) {
    console.error(
      nameHint
        ? `No user named "${nameHint}".`
        : 'Several users exist — pass the name as a second argument.',
    );
    for (const u of allUsers) console.error(`  ${u.name ?? '(no name)'}`);
    process.exitCode = 1;
    return;
  }

  const [group] = await db.select().from(groups).where(eq(groups.slug, slug)).limit(1);
  if (!group) {
    console.error(`No group with slug "${slug}".`);
    process.exitCode = 1;
    return;
  }

  await db.update(groups).set({ ownerId: user.id }).where(eq(groups.id, group.id));

  await db
    .insert(groupMemberships)
    .values({ groupId: group.id, userId: user.id, role: 'owner' })
    .onConflictDoUpdate({
      target: [groupMemberships.groupId, groupMemberships.userId],
      set: { role: 'owner' },
    });

  const [check] = await db
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(
      and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.userId, user.id)),
    )
    .limit(1);

  console.log(`"${group.name}" is now owned by ${user.name ?? user.id} (role: ${check?.role}).`);
  console.log(`Manage it at /groups/${group.slug}/manage`);
}

void runScript(main);
