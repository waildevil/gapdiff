'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { sendFriendRequestAction } from '@/app/actions/friends';
import styles from './AddFriendButton.module.css';

/** Sits inline on a standings row — the natural place to friend someone you can see. */
export function AddFriendButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (sent) return <span className={styles.sent}>Request sent</span>;

  return (
    <button
      className={styles.add}
      disabled={isPending}
      title={error ?? undefined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          const result = await sendFriendRequestAction(userId);
          if (result.ok) {
            setSent(true);
            router.refresh();
          } else {
            setError(result.error);
          }
        });
      }}
    >
      + Friend
    </button>
  );
}
