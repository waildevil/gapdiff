import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { CreateGroupForm } from '@/components/CreateGroupForm';
import { listUserGroups } from '@/lib/groups';
import { listClaims } from '@/lib/verification';
import styles from './groups.module.css';

export const dynamic = 'force-dynamic';

export default async function GroupsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/groups');

  const [groups, claims] = await Promise.all([
    listUserGroups(session.user.id),
    listClaims(session.user.id),
  ]);

  return (
    <div className={styles.wrap}>
      <div className="page-head">
        <div className="eyebrow">Signed in as {session.user.name ?? 'you'}</div>
        <h1>Your groups</h1>
        <p className="page-sub">
          A group is a closed leaderboard. Create one, share the invite link, and everyone
          who joins puts their own accounts on the board.
        </p>
      </div>

      <div className={styles.stack}>
        <CreateGroupForm claimedAccounts={claims.length} />

        <div className="card">
          <div className="card-head">
            <div className="card-title">Groups you&apos;re in</div>
            <div className="card-note">{groups.length}</div>
          </div>

          {groups.length === 0 ? (
            <div className={styles.empty}>
              You&apos;re not in any group yet.
              <div className={styles.emptyHint}>
                Create one above, or open an invite link somebody sent you.
              </div>
            </div>
          ) : (
            groups.map((group) => (
              <div className={styles.row} key={group.id}>
                <div className={styles.name}>
                  <Link className={styles.nameText} href={`/group/${group.slug}`}>
                    {group.name}
                  </Link>
                  <div className={styles.meta}>
                    {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'} ·{' '}
                    {group.trackedCount} tracked{' '}
                    {group.trackedCount === 1 ? 'account' : 'accounts'}
                  </div>
                </div>

                {group.isOwner ? <span className={styles.tag}>Owner</span> : null}

                <Link className={styles.action} href={`/group/${group.slug}`}>
                  Standings
                </Link>

                {group.isOwner ? (
                  <Link className={styles.action} href={`/groups/${group.slug}/manage`}>
                    Manage
                  </Link>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      {claims.length === 0 ? (
        <div className="note">
          <b>You have no Riot accounts claimed yet.</b> You can still create and join
          groups, but you won&apos;t appear on any leaderboard until you{' '}
          <Link href="/accounts" style={{ color: 'var(--accent)' }}>
            add and verify an account
          </Link>
          .
        </div>
      ) : null}
    </div>
  );
}
