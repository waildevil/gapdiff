'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { respondToDuelAction } from '@/app/actions/duels';
import { blockUserAction } from '@/app/actions/friends';
import type { IncomingChallenge } from '@/lib/duels';
import styles from './DuelInbox.module.css';

/** Challenges other people have sent this user — the "someone is challenging you" notification. */
export function DuelInbox({ challenges }: { challenges: IncomingChallenge[] }) {
  const router = useRouter();
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (challenges.length === 0) return null;

  function respond(duelId: number, puuid: string, accept: boolean) {
    setError(null);
    setRespondingTo(puuid);
    startTransition(async () => {
      const result = await respondToDuelAction(duelId, puuid, accept);
      setRespondingTo(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function block(puuid: string, createdByUserId: string) {
    setError(null);
    setRespondingTo(puuid);
    startTransition(async () => {
      const result = await blockUserAction(createdByUserId);
      setRespondingTo(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card section-gap">
      <div className="card-head">
        <div className="card-title">Waiting on you</div>
        <div className="card-note">{challenges.length}</div>
      </div>

      {challenges.map((challenge) => (
        <div className={styles.row} key={`${challenge.duelId}-${challenge.puuid}`}>
          <div className={styles.text}>
            <span className={styles.who}>{challenge.createdByName ?? 'Someone'}</span> challenged{' '}
            <span className={styles.you}>{challenge.gameName}</span>
            {challenge.otherRacerNames.length > 0
              ? ` to race ${challenge.otherRacerNames.join(', ')}`
              : null}
          </div>

          <div className={styles.actions}>
            <button
              className={styles.block}
              onClick={() => block(challenge.puuid, challenge.createdByUserId)}
              disabled={isPending && respondingTo === challenge.puuid}
              title={`Block ${challenge.createdByName ?? 'this person'} — they won't be able to challenge or message you again`}
            >
              Block
            </button>
            <button
              className={styles.decline}
              onClick={() => respond(challenge.duelId, challenge.puuid, false)}
              disabled={isPending && respondingTo === challenge.puuid}
            >
              Decline
            </button>
            <button
              className={styles.accept}
              onClick={() => respond(challenge.duelId, challenge.puuid, true)}
              disabled={isPending && respondingTo === challenge.puuid}
            >
              Accept
            </button>
          </div>
        </div>
      ))}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
