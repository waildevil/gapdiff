import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ChallengeForm } from '@/components/ChallengeForm';
import { DuelInbox } from '@/components/DuelInbox';
import { listIncomingChallenges, listMyDuels } from '@/lib/duels';
import { listClaims } from '@/lib/verification';
import styles from './duels.module.css';

export const dynamic = 'force-dynamic';

export default async function DuelsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/duels');

  const [myAccounts, incoming, myDuels] = await Promise.all([
    listClaims(session.user.id),
    listIncomingChallenges(session.user.id),
    listMyDuels(session.user.id),
  ]);

  return (
    <div className={styles.wrap}>
      <div className="page-head">
        <div className="eyebrow">Duels</div>
        <h1>Race someone&apos;s ranked LP</h1>
        <p className="page-sub">
          Pick your account, challenge up to 3 people, and see who climbs faster. They have
          to accept before their numbers show up.
        </p>
      </div>

      <DuelInbox challenges={incoming} />

      <div className="section-gap">
        <ChallengeForm myAccounts={myAccounts} />
      </div>

      <div className="card section-gap">
        <div className="card-head">
          <div className="card-title">Your duels</div>
          <div className="card-note">{myDuels.length}</div>
        </div>

        {myDuels.length === 0 ? (
          <div className={styles.empty}>No duels yet — start one above.</div>
        ) : (
          myDuels.map((duel) => (
            <Link className={styles.row} href={`/duels/${duel.code}`} key={duel.code}>
              <span className={styles.names}>{duel.racerNames.join(' vs ')}</span>
              <span className={styles.status}>{duel.ended ? 'Ended' : 'Running'}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
