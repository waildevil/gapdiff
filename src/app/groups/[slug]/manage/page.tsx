import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/db';
import { groups } from '@/db/schema';
import { DiscordConnect } from '@/components/DiscordConnect';
import { InviteManager } from '@/components/InviteManager';
import {
  getDiscordConnection,
  isOwner,
  listInvites,
  listMembers,
  listUnclaimedAccounts,
} from '@/lib/groups';
import styles from '../../groups.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ManageGroupPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/signin?callbackUrl=/groups/${slug}/manage`);

  const [group] = await db.select().from(groups).where(eq(groups.slug, slug)).limit(1);
  if (!group) notFound();

  if (!(await isOwner(group.id, session.user.id))) {
    return (
      <div className={styles.wrap}>
        <div className="card" style={{ padding: '44px 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Not your group</h1>
          <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>
            Only the owner of {group.name} can manage it.
          </p>
          <Link href={`/group/${slug}`} style={{ color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 12 }}>
            View the standings instead →
          </Link>
        </div>
      </div>
    );
  }

  const [invites, members, unclaimed, discord] = await Promise.all([
    listInvites(group.id),
    listMembers(group.id),
    listUnclaimedAccounts(group.id),
    getDiscordConnection(group.id),
  ]);

  return (
    <div className={styles.wrap}>
      <div className="page-head">
        <div className="eyebrow">Managing</div>
        <h1>{group.name}</h1>
        <p className="page-sub">
          Invite your friends here. Each of them signs in, adds their own Riot accounts,
          and appears on the board — you never type their names.
        </p>
      </div>

      <div className={styles.stack}>
        <InviteManager groupId={group.id} slug={slug} invites={invites} />

        <div className="section-gap">
          <DiscordConnect groupId={group.id} slug={slug} connection={discord} />
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Members</div>
            <div className="card-note">{members.length}</div>
          </div>

          {members.map((member) => (
            <div className={styles.row} key={member.userId}>
              {member.image ? (
                <img
                  src={member.image}
                  alt=""
                  width={30}
                  height={30}
                  style={{ borderRadius: 'var(--r-sm)', flex: '0 0 auto' }}
                />
              ) : null}

              <div className={styles.name}>
                <div className={styles.nameText}>{member.name ?? 'Unnamed'}</div>
                <div className={styles.meta}>
                  {member.accounts.length === 0
                    ? 'no accounts on the board yet'
                    : member.accounts
                        .map((a) => `${a.gameName}#${a.tagLine}${a.verified ? '' : ' (unverified)'}`)
                        .join(' · ')}
                </div>
              </div>

              {member.role === 'owner' ? <span className={styles.tag}>Owner</span> : null}
            </div>
          ))}
        </div>

        {unclaimed.length > 0 ? (
          <div className="card">
            <div className="card-head">
              <div className="card-title">Unclaimed accounts</div>
              <div className="card-note">{unclaimed.length} on the board, nobody attached</div>
            </div>
            {unclaimed.map((account) => (
              <div className={styles.row} key={account.puuid}>
                <div className={styles.name}>
                  <div className={styles.nameText}>
                    {account.gameName}
                    <span style={{ color: 'var(--faint)' }}>#{account.tagLine}</span>
                  </div>
                  <div className={styles.meta}>added before anyone claimed it</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="note">
        <b>Unclaimed accounts still count.</b> An account can sit on the board without a
        person attached — that&apos;s how somebody who has stopped playing, or who
        won&apos;t sign in, stays in the standings. They just can&apos;t manage it.
      </div>
    </div>
  );
}
