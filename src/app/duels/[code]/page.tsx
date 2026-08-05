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
 * the link can be sent to someone outside the group. Pending racers show no
 * numbers, only that they've been challenged: the whole point of requiring
 * acceptance is that nobody's climb is compared without their say-so.
 */
export default async function DuelPage({ params }: PageProps) {
  const { code } = await params;
  const duel = await getDuel(code);
  if (!duel) notFound();

  const pending = duel.invited.filter((p) => p.status === 'pending');
  const declined = duel.invited.filter((p) => p.status === 'declined');
  const winner = duel.racers.find((r) => r.winner) ?? null;

  return (
    <div className={styles.wrap}>
      <div className="page-head">
        <div className="eyebrow">
          Duel
          {duel.ended ? <span className={styles.endedTag}>Ended</span> : null}
        </div>
        <h1>Ranked LP race</h1>
        <p className="page-sub">
          {duel.racers.length} racing, ranked LP compared against where they started.{' '}
          {duel.ended ? 'Final — nothing here will change again.' : timeLeft(duel.endAt)}
        </p>
      </div>

      {duel.ended && duel.racers.length >= 2 ? (
        <div className={styles.resultBanner}>
          {winner ? (
            <>
              🏆 <b>{winner.gameName}</b> won, {winner.delta! > 0 ? '+' : ''}
              {winner.delta} to{' '}
              {duel.racers
                .filter((r) => !r.winner)
                .map((r) => `${r.delta! > 0 ? '+' : ''}${r.delta}`)
                .join(', ')}
            </>
          ) : (
            <>Tied — nobody climbed further than anyone else.</>
          )}
        </div>
      ) : null}

      <div className="card">
        <div className="card-head">
          <div className="card-title">Standings</div>
          <div className="card-note">
            {duel.createdByName ? `Started by ${duel.createdByName}` : 'Started'}
          </div>
        </div>

        {duel.racers.length === 0 ? (
          <div className={styles.empty}>Nobody has accepted yet.</div>
        ) : (
          duel.racers.map((racer, index) => (
            <div className={styles.row} key={racer.puuid}>
              <div className={styles.position}>{index + 1}</div>

              <div className={styles.who}>
                <div className={styles.name}>
                  {racer.gameName}
                  {racer.winner ? <span className={styles.crown}>👑</span> : null}
                </div>
                <div className={styles.meta}>
                  {racer.formattedStart} → {racer.formattedCurrent}
                </div>
              </div>

              <div
                className={`${styles.delta} ${
                  (racer.delta ?? 0) > 0 ? styles.up : (racer.delta ?? 0) < 0 ? styles.down : ''
                }`}
              >
                {(racer.delta ?? 0) > 0 ? '+' : ''}
                {racer.delta}
              </div>
            </div>
          ))
        )}

        {pending.length > 0 ? (
          <div className={styles.pendingRow}>
            {duel.ended ? 'Never responded: ' : 'Waiting on '}
            {pending.map((p) => p.gameName).join(', ')}
            {duel.ended ? '.' : ' to accept.'}
          </div>
        ) : null}

        {declined.length > 0 ? (
          <div className={styles.pendingRow}>
            {declined.map((p) => p.gameName).join(', ')} declined.
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        <CopyDuelLink code={duel.code} />
        <Link className={styles.back} href="/duels">
          ← Your duels
        </Link>
      </div>
    </div>
  );
}
