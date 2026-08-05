'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { blockUserAction, respondToFriendRequestAction } from '@/app/actions/friends';
import type { FriendRequestView } from '@/lib/friends';
import styles from './DuelInbox.module.css';

/** Incoming friend requests — accept, decline, or block if it's unwanted. */
export function FriendInbox({ requests }: { requests: FriendRequestView[] }) {
  const router = useRouter();
  const [respondingTo, setRespondingTo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (requests.length === 0) return null;

  function respond(requestId: number, accept: boolean) {
    setError(null);
    setRespondingTo(requestId);
    startTransition(async () => {
      const result = await respondToFriendRequestAction(requestId, accept);
      setRespondingTo(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function block(requestId: number, requesterUserId: string) {
    setError(null);
    setRespondingTo(requestId);
    startTransition(async () => {
      const result = await blockUserAction(requesterUserId);
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
        <div className="card-title">Friend requests</div>
        <div className="card-note">{requests.length}</div>
      </div>

      {requests.map((request) => (
        <div className={styles.row} key={request.id}>
          <div className={styles.text}>
            <span className={styles.who}>{request.name ?? 'Someone'}</span> wants to be friends
          </div>

          <div className={styles.actions}>
            <button
              className={styles.block}
              onClick={() => block(request.id, request.userId)}
              disabled={isPending && respondingTo === request.id}
            >
              Block
            </button>
            <button
              className={styles.decline}
              onClick={() => respond(request.id, false)}
              disabled={isPending && respondingTo === request.id}
            >
              Decline
            </button>
            <button
              className={styles.accept}
              onClick={() => respond(request.id, true)}
              disabled={isPending && respondingTo === request.id}
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
