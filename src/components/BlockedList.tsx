'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { unblockUserAction } from '@/app/actions/friends';
import type { BlockedView } from '@/lib/friends';
import styles from './FriendsList.module.css';

export function BlockedList({ blocked }: { blocked: BlockedView[] }) {
  const router = useRouter();
  const [busyWith, setBusyWith] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (blocked.length === 0) return null;

  function unblock(userId: string) {
    setBusyWith(userId);
    startTransition(async () => {
      await unblockUserAction(userId);
      setBusyWith(null);
      router.refresh();
    });
  }

  return (
    <div className="card section-gap">
      <div className="card-head">
        <div className="card-title">Blocked</div>
        <div className="card-note">{blocked.length}</div>
      </div>

      {blocked.map((person) => (
        <div className={styles.row} key={person.userId}>
          <div className={styles.name}>{person.name ?? 'Unnamed'}</div>
          <div className={styles.actions}>
            <button
              className={styles.remove}
              onClick={() => unblock(person.userId)}
              disabled={isPending && busyWith === person.userId}
            >
              Unblock
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
