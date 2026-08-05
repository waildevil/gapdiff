'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelFriendRequestAction } from '@/app/actions/friends';
import type { FriendRequestView } from '@/lib/friends';
import styles from './FriendsList.module.css';

/** Requests you've sent that nobody has answered yet — so "did that even go through" has an answer. */
export function FriendRequestsSent({ requests }: { requests: FriendRequestView[] }) {
  const router = useRouter();
  const [busyWith, setBusyWith] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  if (requests.length === 0) return null;

  function cancel(requestId: number) {
    setBusyWith(requestId);
    startTransition(async () => {
      await cancelFriendRequestAction(requestId);
      setBusyWith(null);
      router.refresh();
    });
  }

  return (
    <div className="card section-gap">
      <div className="card-head">
        <div className="card-title">Sent requests</div>
        <div className="card-note">{requests.length}</div>
      </div>

      {requests.map((request) => (
        <div className={styles.row} key={request.id}>
          <div className={styles.name}>{request.name ?? 'Unnamed'}</div>
          <div className={styles.actions}>
            <span className={styles.pending}>Pending</span>
            <button
              className={styles.remove}
              onClick={() => cancel(request.id)}
              disabled={isPending && busyWith === request.id}
            >
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
