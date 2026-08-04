import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDuel } from '@/lib/duels';
import { CopyDuelLink } from '@/components/CopyDuelLink';
import styles from './duel.module.css';

interface PageProps {
  params: Promise<{ code: string }>;
}

export const dynamic = 'force-dynamic';

function timeLeft(endAt: Date): string {
  const ms = endAt.getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  return hours >= 1 ? `${hours}h left` : 'Ending soon';
}

/**
 * Viewable by link alone, no sign-in required — bragging rights only work if
 * the link can be sent to someone outside the group.
 */
export default async function DuelPage({ params }: PageProps) {
  const { code } = await params;
  const duel = await getDuel(code);
  if (!duel) notFound();

  const leaderDelta = duel.racers[0]?.delta ?? 0;

  return (
    <div className={styles.wrap}>
      <div className="page-head">
        <div className="eyebrow">{duel.group.name}</div>
        <h1>Duel</h1>
        <p className="page-sub">
          {duel.racers.length} racers, ranked LP compared against where they started.{' '}
          {duel.ended ? 'This duel has ended.' : timeLeft(duel.endAt)}
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Standings</div>
          <div className="card-note">
            {duel.createdByName ? `Started by ${duel.createdByName}` : 'Started'}
          </div>
        </div>

        {duel.racers.map((racer, index) => {
          const isLeader = index === 0 && leaderDelta > 0;
          return (
            <div className={styles.row} key={racer.puuid}>
              <div className={styles.position}>{index + 1}</div>

              <div className={styles.who}>
                <div className={styles.name}>
                  {racer.nickname ?? racer.gameName}
                  {isLeader ? <span className={styles.crown}>👑</span> : null}
                </div>
                <div className={styles.meta}>
                  {racer.formattedStart} → {racer.formattedCurrent}
                </div>
              </div>

              <div
                className={`${styles.delta} ${
                  racer.delta > 0 ? styles.up : racer.delta < 0 ? styles.down : ''
                }`}
              >
                {racer.delta > 0 ? '+' : ''}
                {racer.delta}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <CopyDuelLink code={duel.code} />
        <Link className={styles.back} href={`/group/${duel.group.slug}`}>
          ← {duel.group.name} standings
        </Link>
      </div>
    </div>
  );
}
