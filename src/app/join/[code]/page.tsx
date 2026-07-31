import Link from 'next/link';
import { auth } from '@/auth';
import { signInWithDiscord } from '@/app/actions/auth';
import { JoinGroup } from '@/components/JoinGroup';
import { getInvite } from '@/lib/groups';
import { listClaims } from '@/lib/verification';
import styles from './join.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ code: string }>;
}

const DEAD_INVITE: Record<string, string> = {
  revoked: 'This invite has been revoked by the group owner.',
  expired: 'This invite has expired.',
  exhausted: 'This invite has already been used the maximum number of times.',
};

export default async function JoinPage({ params }: PageProps) {
  const { code } = await params;
  const invite = await getInvite(code);

  if (!invite) {
    return (
      <Shell title="Invite not found">
        <p className={styles.body}>
          That link doesn&apos;t match any invite. Check you copied the whole thing, or ask
          for a new one.
        </p>
      </Shell>
    );
  }

  if (!invite.active) {
    return (
      <Shell title={`Can't join ${invite.group.name}`}>
        <p className={styles.body}>{DEAD_INVITE[invite.reason ?? 'revoked']}</p>
        <p className={styles.body}>Ask the group owner for a fresh invite link.</p>
      </Shell>
    );
  }

  const session = await auth();

  if (!session?.user?.id) {
    return (
      <Shell title={`You're invited to ${invite.group.name}`}>
        <p className={styles.body}>
          {invite.invitedBy ? `${invite.invitedBy} invited you.` : 'You have been invited.'}{' '}
          Sign in with Discord to join — it takes a few seconds and nothing is posted on
          your behalf.
        </p>
        {/* Inline server action: a plain arrow can't cross the server component
            boundary as a form action. */}
        <form
          action={async () => {
            'use server';
            await signInWithDiscord(`/join/${code}`);
          }}
        >
          <button className={styles.discord} type="submit">
            Sign in with Discord
          </button>
        </form>
      </Shell>
    );
  }

  const claims = await listClaims(session.user.id);

  return (
    <Shell title={`You're invited to ${invite.group.name}`}>
      <p className={styles.body}>
        {invite.invitedBy ? `${invite.invitedBy} invited you.` : 'You have been invited.'}{' '}
        Joining puts your Riot accounts on this group&apos;s leaderboard.
      </p>

      <JoinGroup
        code={code}
        groupName={invite.group.name}
        claimedAccounts={claims.length}
        verifiedAccounts={claims.filter((c) => c.verifiedAt).length}
      />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.wrap}>
      <div className="card">
        <div className={styles.inner}>
          <div className="eyebrow">Invitation</div>
          <h1 className={styles.title}>{title}</h1>
          {children}
          <p className={styles.back}>
            <Link href="/">← gapdiff</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
