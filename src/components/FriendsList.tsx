'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { blockUserAction, removeFriendAction } from '@/app/actions/friends';
import { OPEN_CHAT_EVENT } from '@/lib/chatEvents';
import type { FriendView } from '@/lib/friends';
import styles from './FriendsList.module.css';

export function FriendsList({ friends }: { friends: FriendView[] }) {
  const router = useRouter();
  const [busyWith, setBusyWith] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function message(friend: FriendView) {
    window.dispatchEvent(
      new CustomEvent(OPEN_CHAT_EVENT, {
        detail: { userId: friend.userId, name: friend.name },
      }),
    );
  }

  function remove(friend: FriendView) {
    setError(null);
    setBusyWith(friend.userId);
    startTransition(async () => {
      const result = await removeFriendAction(friend.userId);
      setBusyWith(null);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function block(friend: FriendView) {
    setError(null);
    setBusyWith(friend.userId);
    startTransition(async () => {
      const result = await blockUserAction(friend.userId);
      setBusyWith(null);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="card section-gap">
      <div className="card-head">
        <div className="card-title">Friends</div>
        <div className="card-note">{friends.length}</div>
      </div>

      {friends.length === 0 ? (
        <div className={styles.empty}>No friends yet — add someone above.</div>
      ) : (
        friends.map((friend) => (
          <div className={styles.row} key={friend.userId}>
            {friend.image ? (
              <img className={styles.avatar} src={friend.image} alt="" width={30} height={30} />
            ) : (
              <span className={styles.avatar} />
            )}
            <div className={styles.name}>{friend.name ?? 'Unnamed'}</div>

            <div className={styles.actions}>
              <button
                className={styles.message}
                onClick={() => message(friend)}
                disabled={isPending && busyWith === friend.userId}
              >
                Message
              </button>
              <button
                className={styles.remove}
                onClick={() => remove(friend)}
                disabled={isPending && busyWith === friend.userId}
              >
                Remove
              </button>
              <button
                className={styles.block}
                onClick={() => block(friend)}
                disabled={isPending && busyWith === friend.userId}
              >
                Block
              </button>
            </div>
          </div>
        ))
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
