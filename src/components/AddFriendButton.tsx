'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { sendFriendRequestAction } from '@/app/actions/friends';
import styles from './AddFriendButton.module.css';

interface AddFriendButtonProps {
  userId: string;
  /** Skips the click-to-send flow when the relationship is already decided —
   *  a standings row has no room to say this, but a profile page does. */
  initialStatus?: 'friends' | 'pending';
}

/** Sits inline on a standings row or a profile header — the natural place to friend someone you can see. */
export function AddFriendButton({ userId, initialStatus }: AddFriendButtonProps) {
  const router = useRouter();
  const [sent, setSent] = useState(initialStatus === 'pending');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (initialStatus === 'friends') return <span className={styles.sent}>Friends</span>;
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
